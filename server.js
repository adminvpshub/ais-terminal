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

// Map socket.id -> { client: SSHClient, stream: SSHStream, distro: string, cwd: string | null }
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
      // Auto-detect OS
      conn.exec('cat /etc/os-release', (err, stream) => {
        if (err) {
          // If detection fails (e.g. channel error), proceed with generic
          connections.set(socket.id, { client: conn, stream: null, distro: 'Linux', cwd: null });
          socket.emit('ssh:distro', 'Linux');
          socket.emit('ssh:status', 'connected');
          return;
        }

        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        }).on('close', () => {
          let distro = 'Linux';
          // Try to parse PRETTY_NAME="Ubuntu 22.04 LTS"
          const prettyMatch = output.match(/^PRETTY_NAME="([^"]+)"/m);
          if (prettyMatch && prettyMatch[1]) {
            distro = prettyMatch[1];
          } else {
             // Fallback to ID and VERSION
             const nameMatch = output.match(/^NAME="([^"]+)"/m);
             if (nameMatch && nameMatch[1]) {
               distro = nameMatch[1];
             }
          }

          console.log(`Detected OS for ${socket.id}: ${distro}`);
          connections.set(socket.id, { client: conn, stream: null, distro, cwd: null });
          socket.emit('ssh:distro', distro);
          socket.emit('ssh:status', 'connected');
        });
      });
    }).on('error', (err) => {
      console.error('SSH Error:', err);
      socket.emit('ssh:error', err.message);
    }).on('end', () => {
      socket.emit('ssh:status', 'disconnected');
      connections.delete(socket.id);
    }).connect({
      host,
      port: 22,
      username,
      privateKey,
      passphrase: passphrase || undefined, // Handle empty string vs undefined
      algorithms: {
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
      }
    });
  });

  socket.on('ssh:execute', (command) => {
    const session = connections.get(socket.id);
    if (!session || !session.client) {
      socket.emit('ssh:error', 'No active connection');
      return;
    }

    // Construct wrapped command to maintain CWD
    let finalCommand = command;
    if (session.cwd) {
       // Escape double quotes in path: " -> \"
       const escapedCwd = session.cwd.replace(/"/g, '\\"');
       finalCommand = `cd "${escapedCwd}" && ${command}`;
    }

    // Append marker to capture new CWD
    const marker = "___SSH_ENGINE_CWD___";
    finalCommand += `; echo "${marker}:$(pwd)"`;

    // Use pty: true to enable pseudo-terminal for interactive commands (sudo, etc)
    session.client.exec(finalCommand, { pty: true }, (err, stream) => {
      if (err) {
        socket.emit('ssh:error', err.message);
        return;
      }

      session.stream = stream;

      // Buffer to handle split chunks
      let buffer = '';

      stream.on('close', (code, signal) => {
        // Process any remaining buffer content
        if (buffer.length > 0) {
            socket.emit('ssh:data', buffer);
        }
        socket.emit('ssh:finished', { code });
        session.stream = null;
      }).on('data', (data) => {
        const chunk = data.toString();
        buffer += chunk;

        // Check if buffer contains the marker or parts of it
        // We only want to process the buffer up to a safe point,
        // effectively buffering the potential marker if it's incomplete.

        // Strategy:
        // 1. Check if the marker exists in the buffer.
        // 2. If it does, extract CWD, strip marker, and emit everything.
        // 3. If it doesn't, check if the end of the buffer *looks like* a partial marker.
        //    If yes, emit everything UP TO the partial match, keep partial in buffer.
        //    If no, emit everything, clear buffer.

        const markerRegex = /___SSH_ENGINE_CWD___:(.*)(\r?\n)/;
        const match = buffer.match(markerRegex);

        if (match) {
            // Full marker found!
            const newCwd = match[1].trim();
            if (newCwd && newCwd !== session.cwd) {
                session.cwd = newCwd;
                socket.emit('ssh:cwd', newCwd);
            }

            // Remove the marker (and the newline) from the buffer
            const cleanBuffer = buffer.replace(match[0], '');

            // Emit the cleaned content
            if (cleanBuffer.length > 0) {
                socket.emit('ssh:data', cleanBuffer);
            }

            // Clear buffer - we assume marker is at the end.
            // If more data comes after (rare), it will be in next chunk or we should have handled it.
            // But to be safe, if we stripped the marker, we reset the buffer to empty
            // (unless there was data AFTER the marker, which is unlikely with ; echo)
            buffer = '';
        } else {
            const markerPrefix = "___SSH_ENGINE_CWD___";

            // Check if we have the marker prefix string inside the buffer (but incomplete match)
            const markerIndex = buffer.indexOf(markerPrefix);

            if (markerIndex !== -1) {
                 // Marker is in buffer! But regex didn't match (so likely missing newline or path).
                 // We should emit everything before the marker, and keep the rest.
                 if (markerIndex > 0) {
                     socket.emit('ssh:data', buffer.slice(0, markerIndex));
                     buffer = buffer.slice(markerIndex);
                 }
                 // If marker is at 0, we emit nothing and keep waiting.
            } else {
                // No full marker string. Check for partial marker at the end.
                // We look for a suffix of buffer that is a prefix of the marker.

                let partialMatch = false;
                let safeEmitIndex = buffer.length;

                // Check for partial marker match at the end of buffer
                // We want the LONGEST suffix that matches the prefix of the marker
                for (let i = Math.min(buffer.length, markerPrefix.length); i >= 1; i--) {
                    const suffix = buffer.slice(-i);
                    if (markerPrefix.startsWith(suffix)) {
                        partialMatch = true;
                        safeEmitIndex = buffer.length - i;
                        break;
                    }
                }

                if (partialMatch) {
                    // Emit safe part
                    if (safeEmitIndex > 0) {
                        const toEmit = buffer.slice(0, safeEmitIndex);
                        socket.emit('ssh:data', toEmit);
                        buffer = buffer.slice(safeEmitIndex); // Keep partial marker in buffer
                    }
                    // If safeEmitIndex is 0, we emit nothing and keep growing buffer
                } else {
                    // No marker trace, emit all
                    if (buffer.length > 0) {
                        socket.emit('ssh:data', buffer);
                        buffer = '';
                    }
                }
            }
        }
      }).stderr.on('data', (data) => {
        socket.emit('ssh:data', data.toString());
      });
    });
  });

  socket.on('ssh:input', (data) => {
    const session = connections.get(socket.id);
    if (session && session.stream) {
      session.stream.write(data);
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