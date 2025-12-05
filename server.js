const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

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
      connections.set(socket.id, { client: conn, stream: null });
      socket.emit('ssh:status', 'connected');
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

  socket.on('disconnect', () => {
    const session = connections.get(socket.id);
    if (session) {
      session.client.end();
      connections.delete(socket.id);
    }
  });
});

// Listen on 0.0.0.0 to allow access from other interfaces (required for some setups)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SSH Backend Server running at http://localhost:${PORT}`);
});