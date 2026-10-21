import { socket } from './sshService';

export interface FileEntry {
    name: string;
    isDirectory: boolean;
    size: number;
    mtime: number;
    permissions: number;
}

export interface FileListResponse {
    path: string;
    files: FileEntry[];
}

export const fileService = {
    listFiles: (path?: string) => {
        socket.emit('files:list', path);
    },

    createDirectory: (path: string) => {
        socket.emit('files:mkdir', path);
    },

    deleteFile: (path: string) => {
        socket.emit('files:delete', path);
    },

    renameFile: (oldPath: string, newPath: string) => {
        socket.emit('files:rename', { oldPath, newPath });
    },

    uploadFile: (file: File, remotePath: string, onProgress: (percent: number) => void) => {
        return new Promise<void>((resolve, reject) => {
            const MAX_SIZE = 200 * 1024 * 1024; // 200MB
            if (file.size > MAX_SIZE) {
                reject(new Error("File exceeds 200MB upload limit"));
                return;
            }

            const chunkSize = 64 * 1024; // 64KB chunks
            // Chunks sent but not yet confirmed written on the remote host. A small window
            // keeps the pipe full while progress follows confirmed bytes, not local reads.
            const maxInFlight = 8;
            const totalSize = file.size;
            let offset = 0;
            let confirmed = 0;
            let inFlight = 0;
            let pumping = false;
            let endSent = false;
            let failed = false;
            // Give up instead of hanging when the server stops responding (e.g. the tunnel stalls)
            const stallTimeoutMs = 60 * 1000;
            let lastActivity = Date.now();
            const watchdog = setInterval(() => {
                if (Date.now() - lastActivity > stallTimeoutMs) {
                    fail(new Error('Upload stalled: no response from server for 60s'));
                }
            }, 5000);

            const onReady = () => {
                lastActivity = Date.now();
                pump();
            };

            // The server drops the SSH session when the socket disconnects, so the upload can't resume
            const onDisconnect = () => {
                fail(new Error('Connection lost during upload'));
            };

            const onSuccess = (path: string) => {
                if (path === remotePath) {
                    cleanup();
                    onProgress(100);
                    resolve();
                }
            };

            const onError = (msg: string) => {
                fail(new Error(msg));
            };

            const fail = (err: Error) => {
                if (failed) return;
                failed = true;
                cleanup();
                reject(err);
            };

            const onChunkAck = (size: number, res?: { ok: boolean; error?: string }) => {
                inFlight--;
                lastActivity = Date.now();
                if (!res?.ok) {
                    fail(new Error(res?.error || 'Upload failed'));
                    return;
                }
                confirmed += size;
                // Hold at 99% until the server reports the file is closed
                onProgress(Math.min(99, Math.round((confirmed / totalSize) * 100)));
                pump();
            };

            // Single sequential loop so chunks are always emitted in file order
            const pump = async () => {
                if (pumping) return;
                pumping = true;
                try {
                    while (!failed && inFlight < maxInFlight && offset < totalSize) {
                        const blob = file.slice(offset, offset + chunkSize);
                        const data = await blob.arrayBuffer();
                        if (failed) return;
                        offset += blob.size;
                        inFlight++;
                        socket.emit('files:upload:chunk', data, (res?: { ok: boolean; error?: string }) => onChunkAck(blob.size, res));
                    }
                    if (!failed && !endSent && offset >= totalSize && inFlight === 0) {
                        endSent = true;
                        socket.emit('files:upload:end');
                    }
                } catch {
                    fail(new Error('File read failed'));
                } finally {
                    pumping = false;
                }
            };

            socket.on('files:upload:ready', onReady);
            socket.on('files:upload:success', onSuccess);
            socket.on('files:error', onError);
            socket.on('disconnect', onDisconnect);

            const cleanup = () => {
                clearInterval(watchdog);
                socket.off('files:upload:ready', onReady);
                socket.off('files:upload:success', onSuccess);
                socket.off('files:error', onError);
                socket.off('disconnect', onDisconnect);
            };

            if (!socket.connected) {
                fail(new Error('Not connected to server'));
                return;
            }
            socket.emit('files:upload:start', { path: remotePath });
        });
    },

    downloadFile: (remotePath: string, onProgress: (percent: number) => void) => {
        return new Promise<Blob>((resolve, reject) => {
            const chunks: ArrayBuffer[] = [];
            let receivedSize = 0;

            // We don't know total size easily unless we listed first.
            // We'll assume caller passes size if they want progress, or we just show spinner.

            const onChunk = (chunk: ArrayBuffer) => {
                chunks.push(chunk);
                receivedSize += chunk.byteLength;
                // onProgress(receivedSize); // Pass raw bytes if total unknown
            };

            const onEnd = () => {
                cleanup();
                const blob = new Blob(chunks);
                resolve(blob);
            };

            const onError = (msg: string) => {
                cleanup();
                reject(new Error(msg));
            };

            socket.on('files:download:chunk', onChunk);
            socket.on('files:download:end', onEnd);
            socket.on('files:error', onError);

            const cleanup = () => {
                socket.off('files:download:chunk', onChunk);
                socket.off('files:download:end', onEnd);
                socket.off('files:error', onError);
            };

            socket.emit('files:download:start', { path: remotePath });
        });
    }
};
