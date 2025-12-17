import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'ssh2';
import cors from 'cors';
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;
const PROFILES_FILE = path.resolve(__dirname, 'ssh_profiles.json');
const SESSIONS_DIR = path.resolve(__dirname, 'sessions');

// Ensure sessions directory exists
fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(err => console.error("Failed to create sessions dir", err));

app.use(cors());
app.use(express.json());

// --- Persistence Endpoints ---

app.get('/profiles', async (req, res) => {
  try {
    const data = await fs.readFile(PROFILES_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    // If file doesn't exist, return empty array
    if (error.code === 'ENOENT') {
      res.json([]);
    } else {
      console.error('Error reading profiles:', error);
      res.status(500).json({ error: 'Failed to read profiles' });
    }
  }
});

app.post('/profiles', async (req, res) => {
  try {
    const profiles = req.body;
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving profiles:', error);
    res.status(500).json({ error: 'Failed to save profiles' });
  }
});

// --- Socket.IO SSH Handling ---

// Map socket.id -> { client: SSHClient, stream: SSHStream, distro: string }
const connections = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('ssh:connect', (config) => {
    const { host, username, privateKey, passphrase } = config;

    // cleanup previous if exists
    if (connections.has(socket.id)) {
      const prev = connections.get(socket.id);
      prev.client.end();
    }

    const conn = new Client();

    conn.on('ready', () => {
        // 1. Detect OS first (quick one-off exec)
        conn.exec('cat /etc/os-release', (err, stream) => {
            let distro = 'Linux';
            if (!err) {
                let output = '';
                stream.on('data', (d) => output += d.toString());
                stream.on('close', () => {
                    const prettyMatch = output.match(/^PRETTY_NAME="([^"]+)"/m);
                    if (prettyMatch && prettyMatch[1]) distro = prettyMatch[1];
                    else {
                        const nameMatch = output.match(/^NAME="([^"]+)"/m);
                        if (nameMatch && nameMatch[1]) distro = nameMatch[1];
                    }

                    // 2. Start Persistent Shell
                    startShell(conn, distro);
                });
            } else {
                startShell(conn, distro);
            }
        });
    }).on('error', (err) => {
      console.error('SSH Error:', err);
      if (err.message && (err.message.includes('ECONNRESET') || err.message.includes('EPIPE'))) {
        socket.emit('ssh:error', 'Connection lost (Network reset or pipe error). Please reconnect.');
      } else {
        socket.emit('ssh:error', err.message);
      }
    }).on('end', () => {
      console.log(`SSH Connection ended for ${socket.id}`);
      socket.emit('ssh:status', 'disconnected');
      connections.delete(socket.id);
    }).connect({
      host,
      port: 22,
      username,
      privateKey,
      passphrase: passphrase || undefined,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      algorithms: {
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
      }
    });

    function startShell(client, distro) {
        // Spawn a shell with a pseudo-terminal
        client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
            if (err) {
                socket.emit('ssh:error', 'Failed to start shell: ' + err.message);
                return;
            }

            console.log(`Shell started for ${socket.id}, OS: ${distro}`);
            connections.set(socket.id, { client, stream, distro });
            socket.emit('ssh:distro', distro);
            socket.emit('ssh:status', 'connected');

            // Pipe stream to socket
            stream.on('data', (data) => {
                // Check for magic marker from AI commands
                // Marker format: ___CMD_DONE:<exit_code>___
                // We need to parse this out of the stream to avoid showing it to user if possible,
                // OR just let it show and have frontend handle it?
                // Actually, if we use a persistent shell, the echo will appear in the output.
                // We should detect it, strip it, and emit ssh:finished.

                // Note: Data can come in chunks. Splitting markers across chunks is a risk.
                // For simplicity in this MVP, we'll scan the string.
                const str = data.toString();
                const markerRegex = /___CMD_DONE:(\d+)___(\r\n|\n)?/;
                const match = str.match(markerRegex);

                if (match) {
                    const code = parseInt(match[1], 10);
                    socket.emit('ssh:finished', { code });
                    // Strip the marker from the output sent to frontend
                    // Also strip the newline after it if present
                    const cleanOutput = str.replace(markerRegex, '');
                    if (cleanOutput) {
                        socket.emit('ssh:data', cleanOutput);
                    }
                } else {
                    socket.emit('ssh:data', str);
                }
            });

            stream.on('close', () => {
                socket.emit('ssh:status', 'disconnected');
                connections.delete(socket.id);
            });
        });
    }
  });

  socket.on('ssh:execute', (command) => {
    const session = connections.get(socket.id);
    if (!session || !session.stream) {
      socket.emit('ssh:error', 'No active connection');
      return;
    }

    // Wrap command with marker to detect completion code
    // "command; echo '___CMD_DONE:$?___'"
    // We add a newline to execute it.
    const wrapped = `${command}; echo "___CMD_DONE:$?___"\n`;
    session.stream.write(wrapped);
  });

  socket.on('ssh:input', (data) => {
    const session = connections.get(socket.id);
    if (session && session.stream) {
      session.stream.write(data);
    }
  });

  socket.on('ssh:resize', ({ cols, rows }) => {
    const session = connections.get(socket.id);
    if (session && session.stream) {
        session.stream.setWindow(rows, cols, 0, 0);
    }
  });

  socket.on('ssh:disconnect', () => {
    const session = connections.get(socket.id);
    if (session) {
      session.client.end();
      connections.delete(socket.id);
    }
  });

  socket.on('session:update_queue', async (queue) => {
    try {
      const filePath = path.join(SESSIONS_DIR, `session_${socket.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(queue, null, 2));
    } catch (err) {
      console.error('Failed to save session queue:', err);
    }
  });

  const cleanup = async () => {
    const session = connections.get(socket.id);
    if (session) {
      session.client.end();
      connections.delete(socket.id);
    }

    // Clean up session file
    try {
       const filePath = path.join(SESSIONS_DIR, `session_${socket.id}.json`);
       await fs.unlink(filePath);
    } catch (e) {
      // ignore if missing
    }
  };

  socket.on('ssh:disconnect', cleanup);
  socket.on('disconnect', cleanup);
});

// Listen on 0.0.0.0 to allow access from other interfaces (required for some setups)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SSH Backend Server running at http://localhost:${PORT}`);
});
