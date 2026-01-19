import { socket } from './sshService';
import { RemoteFile } from '../types';

export const listFiles = (path: string) => {
    socket.emit('files:list', path);
};

export const createDirectory = (path: string) => {
    socket.emit('files:create_dir', path);
};

export const deleteFile = (path: string) => {
    socket.emit('files:delete', path);
};

// Chunk size for uploads (e.g., 512KB)
const CHUNK_SIZE = 512 * 1024;

export const uploadFile = (file: File, remotePath: string, onProgress: (progress: number) => void) => {
    return new Promise<void>((resolve, reject) => {
        const fullPath = remotePath.endsWith('/') ? `${remotePath}${file.name}` : `${remotePath}/${file.name}`;

        socket.emit('files:upload:start', { path: fullPath });

        const handleReady = ({ path }: { path: string }) => {
            if (path !== fullPath) return;
            startUploading();
            socket.off('files:upload:ready', handleReady);
        };

        const handleError = (msg: string) => {
            if (msg.includes('Upload')) {
                 socket.off('files:upload:ready', handleReady);
                 socket.off('files:upload:ack', handleAck);
                 socket.off('files:upload:complete', handleComplete);
                 socket.off('files:error', handleError); // Clean up self
                 reject(new Error(msg));
            }
        };

        socket.on('files:upload:ready', handleReady);
        socket.on('files:error', handleError);

        let offset = 0;

        const startUploading = () => {
             readNextChunk();
        };

        const readNextChunk = () => {
            if (offset >= file.size) {
                 // Should be done, but we wait for ack/complete?
                 // Actually we send done: true with last chunk.
                 return;
            }

            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const reader = new FileReader();

            reader.onload = (e) => {
                if (e.target?.result) {
                    const arrayBuffer = e.target.result as ArrayBuffer;
                    const isLast = offset + arrayBuffer.byteLength >= file.size;

                    socket.emit('files:upload:chunk', {
                        path: fullPath,
                        data: arrayBuffer,
                        done: isLast
                    });

                    offset += arrayBuffer.byteLength;
                    onProgress((offset / file.size) * 100);

                    // Wait for ACK before sending next?
                    // For performance on local/fast network, maybe not needed, but for reliability yes.
                    // We'll implemented simple lock-step or window?
                    // Let's rely on simple lock-step for safety for now.
                }
            };

            reader.readAsArrayBuffer(slice);
        };

        const handleAck = ({ path }: { path: string }) => {
            if (path === fullPath) {
                if (offset < file.size) {
                    readNextChunk();
                }
            }
        };

        const handleComplete = ({ path }: { path: string }) => {
            if (path === fullPath) {
                socket.off('files:upload:ack', handleAck);
                socket.off('files:upload:complete', handleComplete);
                socket.off('files:error', handleError);
                resolve();
            }
        };

        socket.on('files:upload:ack', handleAck);
        socket.on('files:upload:complete', handleComplete);
    });
};

export const downloadFile = (remotePath: string, filename: string, onProgress: (progress: number, blob: Blob) => void) => {
    // Note: Streaming download to disk in browser is tricky without FileSystem API.
    // We will accumulate in memory (Blob) then trigger download.
    // 200MB might crash browser memory?
    // If we use StreamSaver.js we could stream to disk.
    // For now, let's assume standard Blob is okay for < 500MB on modern machines.

    return new Promise<void>((resolve, reject) => {
        socket.emit('files:download', { path: remotePath });

        let receivedSize = 0;
        const chunks: Blob[] = [];

        const handleChunk = ({ path, chunk }: { path: string, chunk: ArrayBuffer }) => {
             if (path !== remotePath) return;
             chunks.push(new Blob([chunk]));
             receivedSize += chunk.byteLength;
             // We don't know total size unless we stat first?
             // Assuming we called stat before or user knows.
             // We pass '0' as total for now if unknown.
        };

        const handleComplete = ({ path }: { path: string }) => {
             if (path !== remotePath) return;
             const blob = new Blob(chunks);
             onProgress(100, blob);

             socket.off('files:download:chunk', handleChunk);
             socket.off('files:download:complete', handleComplete);
             socket.off('files:error', handleError);
             resolve();
        };

        const handleError = (msg: string) => {
             if (msg.includes('Download')) {
                 socket.off('files:download:chunk', handleChunk);
                 socket.off('files:download:complete', handleComplete);
                 socket.off('files:error', handleError);
                 reject(new Error(msg));
             }
        };

        socket.on('files:download:chunk', handleChunk);
        socket.on('files:download:complete', handleComplete);
        socket.on('files:error', handleError);
    });
};
