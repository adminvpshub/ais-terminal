import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'ssh2';
import cors from 'cors';
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { hashPin, verifyPin, encrypt, decrypt, isEncrypted } from './services/security.js';

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
const SECURITY_FILE = path.resolve(__dirname, 'security.json');
const SESSIONS_DIR = path.resolve(__dirname, 'sessions');

// Ensure sessions directory exists
fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(err => console.error("Failed to create sessions dir", err));

app.use(cors());
app.use(express.json());

// --- Authentication & Security Endpoints ---

// Check if a Master PIN is set up
app.get('/auth/status', async (req, res) => {
    try {
        await fs.access(SECURITY_FILE);
        res.json({ isSetup: true });
    } catch {
        res.json({ isSetup: false });
    }
});

// Setup Master PIN (and migrate existing profiles)
app.post('/auth/setup', async (req, res) => {
    const { pin } = req.body;
    if (!pin || pin.length !== 6) {
        return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }

    try {
        // Check if already setup
        try {
            await fs.access(SECURITY_FILE);
            return res.status(400).json({ error: "Master PIN is already set up" });
        } catch {
            // Not setup, proceed
        }

        // 1. Create Security File
        const hash = await hashPin(pin);
        await fs.writeFile(SECURITY_FILE, JSON.stringify({ hash }), 'utf-8');

        // 2. Encrypt existing profiles
        let profiles = [];
        try {
            const data = await fs.readFile(PROFILES_FILE, 'utf-8');
            profiles = JSON.parse(data);
        } catch (e) {
            // Ignore if no profiles
        }

        if (Array.isArray(profiles) && profiles.length > 0) {
            const encryptedProfiles = await Promise.all(profiles.map(async (p) => {
                // Check if already encrypted (e.g. from previous PIN setup)
                // If so, we can't decrypt it because we don't have the old PIN.
                // We must wipe it to prevent double-encryption corruption.
                if (isEncrypted(p.privateKey)) {
                    console.warn(`Profile ${p.id} appears to be encrypted. Clearing private key during reset.`);
                    return {
                        ...p,
                        privateKey: "", // Wipe invalid key
                        passphrase: isEncrypted(p.passphrase) ? "" : p.passphrase
                    };
                }

                const encKey = await encrypt(p.privateKey, pin);
                const encPass = p.passphrase ? await encrypt(p.passphrase, pin) : undefined;
                return {
                    ...p,
                    privateKey: encKey,
                    passphrase: encPass
                };
            }));
            await fs.writeFile(PROFILES_FILE, JSON.stringify(encryptedProfiles, null, 2), 'utf-8');
        }

        res.json({ success: true });

    } catch (error) {
        console.error("Setup failed:", error);
        res.status(500).json({ error: "Failed to setup security" });
    }
});

// Verify PIN
app.post('/auth/verify', async (req, res) => {
    const { pin } = req.body;
    try {
        const data = await fs.readFile(SECURITY_FILE, 'utf-8');
        const { hash } = JSON.parse(data);
        const isValid = await verifyPin(pin, hash);
        res.json({ valid: isValid });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ error: "Verification failed" });
    }
});

// --- Persistence Endpoints ---

app.get('/profiles', async (req, res) => {
  try {
    const data = await fs.readFile(PROFILES_FILE, 'utf-8');
    const profiles = JSON.parse(data);

    // Mask sensitive data
    const masked = profiles.map(p => ({
        ...p,
        privateKey: !!p.privateKey, // Boolean indicating existence
        passphrase: !!p.passphrase
    }));

    res.json(masked);
  } catch (error) {
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
    const profiles = req.body; // Expects full profiles list from frontend
    // The frontend sends the *new* list.
    // BUT, the frontend doesn't have the encrypted keys. It has "true".
    // So we can't just overwrite. We need to merge.
    // Actually, when adding/editing a profile, the frontend sends the *new* profile data.
    // If it's an edit, it might send a new key or keep the old one.
    // If we change the API to receive just the "to be saved" profile (add/update) it's easier,
    // but the current frontend sends the entire list.

    // Let's refactor: Expect { profiles, pin }
    // We need the PIN to encrypt any *new* keys.
    // And for existing keys that are just "true", we must preserve the old encrypted value from disk.

    const { profiles: newProfiles, pin } = req.body;

    if (!pin) {
        return res.status(400).json({ error: "PIN is required to save profiles" });
    }

    // Verify PIN first
    const secData = await fs.readFile(SECURITY_FILE, 'utf-8');
    const { hash } = JSON.parse(secData);
    if (!await verifyPin(pin, hash)) {
        return res.status(403).json({ error: "Invalid PIN" });
    }

    // Load existing to preserve encrypted data
    let existingProfiles = [];
    try {
        const existingData = await fs.readFile(PROFILES_FILE, 'utf-8');
        existingProfiles = JSON.parse(existingData);
    } catch (e) {}

    const mergedProfiles = await Promise.all(newProfiles.map(async (p) => {
        // Check if this is an update or new
        const existing = existingProfiles.find(ep => ep.id === p.id);

        let finalPrivateKey = existing?.privateKey;
        let finalPassphrase = existing?.passphrase;

        // If frontend sent a string for privateKey (changed or new), encrypt it.
        // If it sent 'true' or boolean, keep existing.
        if (typeof p.privateKey === 'string' && p.privateKey.length > 0) {
            finalPrivateKey = await encrypt(p.privateKey, pin);
        } else if (p.privateKey === true && existing) {
            finalPrivateKey = existing.privateKey;
        }

        if (typeof p.passphrase === 'string' && p.passphrase.length > 0) {
            finalPassphrase = await encrypt(p.passphrase, pin);
        } else if (p.passphrase === true && existing) {
            finalPassphrase = existing.passphrase;
        } else if (!p.passphrase) {
            finalPassphrase = undefined;
        }

        return {
            ...p,
            privateKey: finalPrivateKey,
            passphrase: finalPassphrase
        };
    }));

    await fs.writeFile(PROFILES_FILE, JSON.stringify(mergedProfiles, null, 2), 'utf-8');
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

  socket.on('ssh:connect', async (payload) => {
    // Payload can be { profileId, pin } OR raw config (legacy support removed for security)
    const { profileId, pin } = payload;

    if (!profileId || !pin) {
        socket.emit('ssh:error', 'Missing profile ID or PIN');
        return;
    }

    try {
        // Load profile and decrypt
        const data = await fs.readFile(PROFILES_FILE, 'utf-8');
        const profiles = JSON.parse(data);
        const profile = profiles.find(p => p.id === profileId);

        if (!profile) {
            socket.emit('ssh:error', 'Profile not found');
            return;
        }

        // Verify PIN implicitly by trying to decrypt?
        // Or verify explicitly? Explicit is better error message.
        const secData = await fs.readFile(SECURITY_FILE, 'utf-8');
        const { hash } = JSON.parse(secData);
        if (!await verifyPin(pin, hash)) {
            socket.emit('ssh:error', 'Invalid PIN');
            return;
        }

        let privateKey;
        try {
            privateKey = await decrypt(profile.privateKey, pin);
        } catch (e) {
            socket.emit('ssh:error', 'Failed to decrypt key. PIN might be wrong or key corrupted.');
            return;
        }

        let passphrase;
        if (profile.passphrase) {
            try {
                passphrase = await decrypt(profile.passphrase, pin);
            } catch (e) {
                 // ignore or warn?
            }
        }

        const { host, username } = profile;

        // cleanup previous if exists
        if (connections.has(socket.id)) {
            const prev = connections.get(socket.id);
            prev.client.end();
        }

        const conn = new Client();

        conn.on('ready', () => {
            // 1. Detect OS first
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
                        startShell(conn, distro);
                    });
                } else {
                    startShell(conn, distro);
                }
            });
        }).on('error', (err) => {
            console.error('SSH Error:', err);
            socket.emit('ssh:error', err.message);
        }).on('end', () => {
            console.log(`SSH Connection ended for ${socket.id}`);
            socket.emit('ssh:status', 'disconnected');
            connections.delete(socket.id);
        }).connect({
            host,
            port: 22,
            username,
            privateKey,
            passphrase,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
            algorithms: {
                serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
            }
        });

        function startShell(client, distro) {
            client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
                if (err) {
                    socket.emit('ssh:error', 'Failed to start shell: ' + err.message);
                    return;
                }
                console.log(`Shell started for ${socket.id}, OS: ${distro}`);
                connections.set(socket.id, { client, stream, distro });
                socket.emit('ssh:distro', distro);
                socket.emit('ssh:status', 'connected');

                stream.on('data', (data) => {
                    const str = data.toString();
                    const markerRegex = /___CMD_DONE:(\d+)___(\r\n|\n)?/;
                    const match = str.match(markerRegex);
                    if (match) {
                        const code = parseInt(match[1], 10);
                        socket.emit('ssh:finished', { code });
                        const cleanOutput = str.replace(markerRegex, '');
                        if (cleanOutput) socket.emit('ssh:data', cleanOutput);
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

    } catch (e) {
        console.error("Connection handler error:", e);
        socket.emit('ssh:error', 'Internal server error during connection');
    }
  });

  socket.on('ssh:execute', (command) => {
    const session = connections.get(socket.id);
    if (!session || !session.stream) {
      socket.emit('ssh:error', 'No active connection');
      return;
    }
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
    try {
       const filePath = path.join(SESSIONS_DIR, `session_${socket.id}.json`);
       await fs.unlink(filePath);
    } catch (e) { }
  };

  socket.on('ssh:disconnect', cleanup);
  socket.on('disconnect', cleanup);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SSH Backend Server running at http://localhost:${PORT}`);
});
