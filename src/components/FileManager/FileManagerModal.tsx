import React, { useState, useEffect, useRef } from 'react';
import { FileList } from './FileList';
import { TransferProgress } from './TransferProgress';
import { RemoteFile, FileTransfer } from '../../types';
import { listFiles, uploadFile, downloadFile, deleteFile, createDirectory } from '../../services/fileService';
import { socket } from '../../services/sshService';
import { X, Upload, FolderPlus, RefreshCw, ChevronRight, Home, ArrowUp } from 'lucide-react';

interface FileManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialPath?: string;
}

export const FileManagerModal: React.FC<FileManagerModalProps> = ({ isOpen, onClose, initialPath = '.' }) => {
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [files, setFiles] = useState<RemoteFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [transfers, setTransfers] = useState<FileTransfer[]>([]);

    const dragCounter = useRef(0);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadFiles(currentPath);
        }
    }, [isOpen, currentPath]);

    useEffect(() => {
        const onList = ({ path, files }: { path: string, files: RemoteFile[] }) => {
            if (path === currentPath) {
                setFiles(files);
                setIsLoading(false);
            }
        };

        const onError = (msg: string) => {
            if (msg.includes('files:')) return; // handled locally if needed?
            // Global file error
            if (isLoading) {
                setError(msg);
                setIsLoading(false);
            }
        };

        const onActionSuccess = ({ action, path }: { action: string, path: string }) => {
            // Reload if action affected current dir
            // If delete file in current dir, reload
            // If mkdir in current dir, reload
            // Simple check:
            loadFiles(currentPath);
        };

        socket.on('files:list:data', onList);
        socket.on('files:error', onError);
        socket.on('files:action:success', onActionSuccess);

        return () => {
            socket.off('files:list:data', onList);
            socket.off('files:error', onError);
            socket.off('files:action:success', onActionSuccess);
        };
    }, [currentPath, isLoading]);

    const loadFiles = (path: string) => {
        setIsLoading(true);
        setError(null);
        listFiles(path);
    };

    const handleNavigate = (file: RemoteFile) => {
        if (file.type === 'd') {
            const newPath = currentPath === '/'
                ? `/${file.name}`
                : currentPath.endsWith('/')
                    ? `${currentPath}${file.name}`
                    : `${currentPath}/${file.name}`;
            setCurrentPath(newPath);
        }
    };

    const handleUp = () => {
        if (currentPath === '/' || currentPath === '.') return;
        const parts = currentPath.split('/');
        parts.pop();
        const newPath = parts.join('/') || '/';
        setCurrentPath(newPath);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            await startUpload(file);
        }
    };

    const startUpload = async (file: File) => {
        const id = crypto.randomUUID();
        const transfer: FileTransfer = {
            id,
            type: 'upload',
            filename: file.name,
            progress: 0,
            status: 'running',
            startTime: Date.now(),
            totalSize: file.size,
            transferredSize: 0
        };

        setTransfers(prev => [...prev, transfer]);

        try {
            await uploadFile(file, currentPath, (progress) => {
                setTransfers(prev => prev.map(t => t.id === id ? { ...t, progress } : t));
            });
            setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'completed', progress: 100 } : t));
            loadFiles(currentPath); // Refresh
        } catch (err: any) {
            setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error: err.message } : t));
        }
    };

    const handleDownload = async (file: RemoteFile) => {
        const id = crypto.randomUUID();
        const transfer: FileTransfer = {
            id,
            type: 'download',
            filename: file.name,
            progress: 0,
            status: 'running',
            startTime: Date.now(),
            totalSize: file.size,
            transferredSize: 0
        };

        setTransfers(prev => [...prev, transfer]);

        try {
             const fullPath = currentPath.endsWith('/') ? `${currentPath}${file.name}` : `${currentPath}/${file.name}`;
             await downloadFile(fullPath, file.name, (progress, blob) => {
                 if (progress === 100 && blob) {
                     // Trigger download
                     const url = window.URL.createObjectURL(blob);
                     const a = document.createElement('a');
                     a.href = url;
                     a.download = file.name;
                     document.body.appendChild(a);
                     a.click();
                     window.URL.revokeObjectURL(url);
                     a.remove();
                 }
                 setTransfers(prev => prev.map(t => t.id === id ? { ...t, progress } : t));
             });
             setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t));
        } catch (err: any) {
             setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error: err.message } : t));
        }
    };

    const handleDelete = (file: RemoteFile) => {
        if (confirm(`Are you sure you want to delete ${file.name}?`)) {
             const fullPath = currentPath.endsWith('/') ? `${currentPath}${file.name}` : `${currentPath}/${file.name}`;
             deleteFile(fullPath);
        }
    };

    const handleCreateDir = () => {
        const name = prompt("Folder name:");
        if (name) {
            const fullPath = currentPath.endsWith('/') ? `${currentPath}${name}` : `${currentPath}/${name}`;
            createDirectory(fullPath);
        }
    };

    // Drag and Drop
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            // Handle multiple files?
            // For now just first, or loop
            Array.from(e.dataTransfer.files).forEach(file => {
                 startUpload(file);
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            {/* Modal Container - pointer-events-auto */}
            <div
                className="bg-gray-800 w-[800px] h-[600px] rounded-lg shadow-2xl border border-gray-700 flex flex-col pointer-events-auto overflow-hidden relative"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 bg-blue-500/20 z-50 border-4 border-blue-500 border-dashed rounded-lg flex items-center justify-center backdrop-blur-sm">
                        <div className="text-blue-200 text-xl font-semibold flex flex-col items-center gap-2">
                            <Upload size={48} />
                            Drop files to upload
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-gray-900/50">
                    <div className="flex items-center gap-2 text-gray-200 font-medium">
                        <FolderPlus size={18} className="text-blue-400" />
                        File Manager
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                {/* Toolbar / Breadcrumbs */}
                <div className="p-2 border-b border-gray-700 flex items-center gap-2 bg-gray-800">
                     <button onClick={handleUp} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="Up one level">
                         <ArrowUp size={16} />
                     </button>
                     <button onClick={() => loadFiles(currentPath)} className={`p-1.5 hover:bg-gray-700 rounded text-gray-400 ${isLoading ? 'animate-spin' : ''}`} title="Refresh">
                         <RefreshCw size={16} />
                     </button>
                     <button onClick={() => setCurrentPath('.')} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="Home">
                         <Home size={16} />
                     </button>

                     <div className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 font-mono flex items-center overflow-hidden whitespace-nowrap">
                         {currentPath}
                     </div>

                     <button onClick={handleCreateDir} className="p-1.5 hover:bg-gray-700 rounded text-blue-400" title="New Folder">
                         <FolderPlus size={18} />
                     </button>
                     <label className="p-1.5 hover:bg-gray-700 rounded text-blue-400 cursor-pointer" title="Upload File">
                         <Upload size={18} />
                         <input type="file" className="hidden" onChange={handleUpload} />
                     </label>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-hidden p-2 flex flex-col">
                    {error && (
                        <div className="mb-2 p-2 bg-red-900/30 border border-red-500/30 text-red-300 text-sm rounded">
                            {error}
                        </div>
                    )}
                    <FileList
                        files={files}
                        onNavigate={handleNavigate}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                    />
                </div>

                {/* Transfers */}
                <TransferProgress
                    transfers={transfers}
                    onClear={(id) => setTransfers(prev => prev.filter(t => t.id !== id))}
                />
            </div>
        </div>
    );
};
