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
            const chunkSize = 64 * 1024; // 64KB chunks
            const totalSize = file.size;
            let offset = 0;

            const onReady = () => {
                readNextChunk();
            };

            const onSuccess = (path: string) => {
                if (path === remotePath) {
                    cleanup();
                    resolve();
                }
            };

            const onError = (msg: string) => {
                cleanup();
                reject(new Error(msg));
            };

            const readNextChunk = () => {
                if (offset >= totalSize) {
                    socket.emit('files:upload:end');
                    return;
                }

                const reader = new FileReader();
                const blob = file.slice(offset, offset + chunkSize);

                reader.onload = (e) => {
                    if (e.target?.result) {
                        socket.emit('files:upload:chunk', e.target.result);
                        offset += blob.size;
                        onProgress(Math.min(100, Math.round((offset / totalSize) * 100)));
                        // We can blindly push, or wait for ack.
                        // SSH streams handle backpressure but socket.io might flood.
                        // For MVP, we just push.
                        readNextChunk();
                    }
                };
                reader.onerror = () => reject(new Error('File read failed'));
                reader.readAsArrayBuffer(blob);
            };

            socket.on('files:upload:ready', onReady);
            socket.on('files:upload:success', onSuccess);
            socket.on('files:error', onError);

            const cleanup = () => {
                socket.off('files:upload:ready', onReady);
                socket.off('files:upload:success', onSuccess);
                socket.off('files:error', onError);
            };

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
