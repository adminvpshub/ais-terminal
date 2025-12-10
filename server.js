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

// Map socket.id -> { client: SSHClient, stream: SSHStream }
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
          connections.set(socket.id, { client: conn, stream: null, distro: 'Linux' });
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
          connections.set(socket.id, { client: conn, stream: null, distro });
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

    // Use pty: true to enable pseudo-terminal for interactive commands (sudo, etc)
    session.client.exec(command, { pty: true }, (err, stream) => {
      if (err) {
        socket.emit('ssh:error', err.message);
        return;
      }

      session.stream = stream;

      stream.on('close', (code, signal) => {
        socket.emit('ssh:finished', { code });
        session.stream = null;
      }).on('data', (data) => {
        socket.emit('ssh:data', data.toString());
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