import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'ssh2';
import cors from 'cors';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

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

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

app.use(cors());
app.use(express.json());

// --- AI Endpoints (Proxy) ---

app.post('/api/ai/generate', async (req, res) => {
    if (!genAI) return res.status(500).json({ error: "Gemini API key not configured on server" });
    const { prompt, config } = req.body;
    try {
        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
            config: config
        });

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            res.json({ text });
        } else {
            console.error("Unexpected AI Response structure:", JSON.stringify(result, null, 2));
            res.status(500).json({ error: "Failed to generate text from AI response" });
        }
    } catch (error) {
        console.error("AI Generation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  // Handle React routing, return all requests to React app
  app.get(/.*/, (req, res, next) => {
      // If it's an API route, skip
      if (req.url.startsWith('/socket.io')) return next();
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// --- Socket.IO SSH Handling ---

// Map socket.id -> { client: SSHClient, stream: SSHStream, distro: string }
const connections = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('ssh:connect', async (payload) => {
    // Payload is now direct: { host, username, privateKey, passphrase }
    const { host, username, privateKey, passphrase } = payload;

    if (!host || !username || !privateKey) {
        socket.emit('ssh:error', 'Missing connection details');
        return;
    }

    try {

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

                // Initialize SFTP
                client.sftp((err, sftp) => {
                    if (err) {
                        console.error("SFTP Init Error:", err);
                        // We don't fail the connection, just SFTP won't work
                    } else {
                        const session = connections.get(socket.id);
                        if (session) {
                            session.sftp = sftp;
                        } else {
                            // If race condition where shell added it first?
                            // connections.set might not have happened yet if we do this parallel.
                            // But here we are inside startShell.
                            // connections.set happens below.
                            // Wait, connections.set is CALLED below.
                        }
                    }
                });

                connections.set(socket.id, { client, stream, distro });
                // We need to update the session object with SFTP when it becomes available.
                // The SFTP callback is async.

                // Let's refactor slightly to ensure clean storage
                // But connections.get(socket.id) inside the callback works because `connections.set` is synchronous below.

                socket.emit('ssh:distro', distro);
                socket.emit('ssh:status', 'connected');

                stream.on('data', (data) => {
                    let str = data.toString();

                    // Hide echoed command marker from output
                    // Matches: ; echo "___CMD_DONE:$?___"
                    const echoRegex = /;\s*echo\s+"___CMD_DONE:\$\?___"/g;
                    str = str.replace(echoRegex, '');

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
                if (connections.has(socket.id)) {
                    socket.emit('ssh:status', 'disconnected');
                    connections.delete(socket.id);
                }
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

  // --- File Manager Handlers ---

  socket.on('files:list', (path) => {
    const session = connections.get(socket.id);
    if (!session || !session.sftp) {
        socket.emit('files:error', 'SFTP not available');
        return;
    }
    const targetPath = path || '.';
    session.sftp.readdir(targetPath, (err, list) => {
        if (err) {
            socket.emit('files:error', `List failed: ${err.message}`);
            return;
        }
        // Normalize list
        // item: { filename, longname, attrs: { size, mtime, atime, uid, gid, mode } }
        const files = list.map(item => ({
            name: item.filename,
            isDirectory: (item.attrs.mode & 0o40000) === 0o40000,
            size: item.attrs.size,
            mtime: item.attrs.mtime * 1000, // Convert to ms
            permissions: item.attrs.mode
        }));

        // If path is '.', resolve real path
        if (targetPath === '.') {
             session.sftp.realpath('.', (err, absPath) => {
                 socket.emit('files:list', { path: absPath || '/', files });
             });
        } else {
             socket.emit('files:list', { path: targetPath, files });
        }
    });
  });

  socket.on('files:mkdir', (path) => {
      const session = connections.get(socket.id);
      if (!session || !session.sftp) return;
      session.sftp.mkdir(path, (err) => {
          if (err) socket.emit('files:error', `Mkdir failed: ${err.message}`);
          else socket.emit('files:action_success', 'mkdir');
      });
  });

  socket.on('files:delete', (path) => {
      const session = connections.get(socket.id);
      if (!session || !session.sftp) return;

      // Try unlink (file) first, then rmdir (dir)
      session.sftp.unlink(path, (err) => {
          if (err) {
              // If failed, try rmdir
              session.sftp.rmdir(path, (err2) => {
                  if (err2) socket.emit('files:error', `Delete failed: ${err.message}`);
                  else socket.emit('files:action_success', 'delete');
              });
          } else {
              socket.emit('files:action_success', 'delete');
          }
      });
  });

  socket.on('files:rename', ({ oldPath, newPath }) => {
      const session = connections.get(socket.id);
      if (!session || !session.sftp) return;
      session.sftp.rename(oldPath, newPath, (err) => {
          if (err) socket.emit('files:error', `Rename failed: ${err.message}`);
          else socket.emit('files:action_success', 'rename');
      });
  });

  // --- File Transfer Handlers ---

  socket.on('files:upload:start', ({ path: filePath }) => {
      const session = connections.get(socket.id);
      if (!session || !session.sftp) return;

      try {
          // If a stream exists, close it (cleanup)
          if (session.uploadStream) {
              session.uploadStream.end();
          }

          const stream = session.sftp.createWriteStream(filePath);
          session.uploadStream = stream;

          stream.on('close', () => {
             // Upload finished (handled in end usually)
             socket.emit('files:upload:success', filePath);
             session.uploadStream = null;
          });

          stream.on('error', (err) => {
             socket.emit('files:error', `Upload failed: ${err.message}`);
             session.uploadStream = null;
          });

          socket.emit('files:upload:ready');
      } catch (err) {
          socket.emit('files:error', `Upload start failed: ${err.message}`);
      }
  });

  socket.on('files:upload:chunk', (data) => {
      const session = connections.get(socket.id);
      if (session && session.uploadStream) {
          session.uploadStream.write(data);
      }
  });

  socket.on('files:upload:end', () => {
      const session = connections.get(socket.id);
      if (session && session.uploadStream) {
          session.uploadStream.end();
          // Success emitted in 'close' event
      }
  });

  socket.on('files:download:start', ({ path: filePath }) => {
      const session = connections.get(socket.id);
      if (!session || !session.sftp) return;

      try {
          const stream = session.sftp.createReadStream(filePath);

          stream.on('data', (chunk) => {
              socket.emit('files:download:chunk', chunk);
          });

          stream.on('close', () => {
              socket.emit('files:download:end');
          });

          stream.on('error', (err) => {
              socket.emit('files:error', `Download failed: ${err.message}`);
          });

      } catch (err) {
          socket.emit('files:error', `Download start failed: ${err.message}`);
      }
  });

  socket.on('ssh:disconnect', () => {
    const session = connections.get(socket.id);
    if (session) {
      session.client.end();
      connections.delete(socket.id);
    }
  });

  const cleanup = async () => {
    const session = connections.get(socket.id);
    if (session) {
      session.client.end();
      connections.delete(socket.id);
    }
  };

  socket.on('ssh:disconnect', cleanup);
  socket.on('disconnect', cleanup);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SSH Backend Server running at port ${PORT}`);
});
