import React, { useState, useEffect, useRef } from 'react';
import { fileService, FileEntry } from '../../services/fileService';
import { socket } from '../../services/sshService';
import { FileRow } from './FileRow';
import { ConfirmationModal } from '../ConfirmationModal';
import { FolderPlus, Upload, RefreshCw, ChevronRight, Home, ArrowUp, X, Eye, EyeOff } from 'lucide-react';

interface FileManagerPanelProps {
    onClose: () => void;
}

export const FileManagerPanel: React.FC<FileManagerPanelProps> = ({ onClose }) => {
    const [currentPath, setCurrentPath] = useState<string>('.');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);

    // Inline editing states
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [renamingFileName, setRenamingFileName] = useState<string | null>(null);

    // Confirmation Modal State
    const [confirmation, setConfirmation] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {}
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = () => {
        setIsLoading(true);
        setError(null);
        setIsCreatingFolder(false);
        setRenamingFileName(null);
        fileService.listFiles(currentPath);
    };

    useEffect(() => {
        refresh();

        const onList = (data: { path: string, files: FileEntry[] }) => {
            setCurrentPath(data.path);
            // Sort: Directories first, then files. Alphabetical.
            const sorted = data.files.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) {
                    return a.name.localeCompare(b.name);
                }
                return a.isDirectory ? -1 : 1;
            });
            setFiles(sorted);
            setIsLoading(false);
        };

        const onError = (msg: string) => {
            console.error("File Manager Error:", msg);
            setError(msg);
            setIsLoading(false);
        };

        const onActionSuccess = (action: string) => {
            refresh();
        };

        socket.on('files:list', onList);
        socket.on('files:error', onError);
        socket.on('files:action_success', onActionSuccess);

        return () => {
            socket.off('files:list', onList);
            socket.off('files:error', onError);
            socket.off('files:action_success', onActionSuccess);
        };
    }, [currentPath]);

    const handleNavigate = (file: FileEntry) => {
        if (file.isDirectory) {
            // Check if it is special link? No, SFTP returns names.
            // Just append name.
            const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            setCurrentPath(newPath);
        }
    };

    const handleUp = () => {
        if (currentPath === '/') return;
        const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
        setCurrentPath(parent);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadProgress(0);
        try {
            const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            await fileService.uploadFile(file, remotePath, (p) => setUploadProgress(p));
            refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDownload = async (file: FileEntry) => {
        try {
            const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            // We don't have progress UI for download yet, just wait
            const blob = await fileService.downloadFile(remotePath, () => {});

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleMkdir = () => {
        setIsCreatingFolder(true);
    };

    const submitMkdir = (name: string) => {
        if (name && name.trim()) {
            const path = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
            fileService.createDirectory(path);
            setIsCreatingFolder(false);
        } else {
            setIsCreatingFolder(false);
        }
    };

    const handleDelete = (file: FileEntry) => {
        setConfirmation({
            isOpen: true,
            title: 'Delete File',
            message: `Are you sure you want to delete "${file.name}"? This action cannot be undone.`,
            onConfirm: () => {
                const path = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
                fileService.deleteFile(path);
                setConfirmation(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleRename = (file: FileEntry) => {
        setRenamingFileName(file.name);
    };

    const submitRename = (file: FileEntry, newName: string) => {
        if (newName && newName !== file.name) {
            const oldPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            const newPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`;
            fileService.renameFile(oldPath, newPath);
        }
        setRenamingFileName(null);
    };

    // Breadcrumbs logic
    const pathParts = currentPath.split('/').filter(Boolean);

    return (
        <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800 w-80 flex-shrink-0 transition-all">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-3 border-b border-gray-800 bg-gray-900">
                <span className="font-semibold text-gray-200 text-sm">File Manager</span>
                <button onClick={onClose} className="text-gray-500 hover:text-white">
                    <X size={16} />
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 bg-gray-800/50 border-b border-gray-800">
                <button onClick={handleUp} disabled={currentPath === '/'} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30">
                    <ArrowUp size={16} />
                </button>
                <button onClick={refresh} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
                    <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                </button>
                <button onClick={() => setShowHiddenFiles(!showHiddenFiles)} className={`p-1.5 rounded transition-colors ${showHiddenFiles ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`} title={showHiddenFiles ? "Hide System Files" : "Show System Files"}>
                    {showHiddenFiles ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <div className="h-4 w-px bg-gray-700 mx-1"></div>
                <button onClick={handleMkdir} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded" title="New Folder">
                    <FolderPlus size={16} />
                </button>
                <button onClick={handleUploadClick} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded" title="Upload File">
                    <Upload size={16} />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                />
            </div>

            {/* Path / Breadcrumbs */}
            <div className="px-3 py-2 text-xs text-gray-400 font-mono border-b border-gray-800 overflow-x-auto whitespace-nowrap scrollbar-thin">
                <span
                    className="cursor-pointer hover:text-blue-400 hover:underline"
                    onClick={() => setCurrentPath('/')}
                >/</span>
                {pathParts.map((part, i) => (
                    <span key={i}>
                        <span className="text-gray-600 mx-1">/</span>
                        <span
                            className="cursor-pointer hover:text-blue-400 hover:underline"
                            onClick={() => {
                                // Reconstruct path up to this part
                                const newP = '/' + pathParts.slice(0, i + 1).join('/');
                                setCurrentPath(newP);
                            }}
                        >{part}</span>
                    </span>
                ))}
            </div>

            {/* Upload Progress */}
            {uploadProgress !== null && (
                <div className="px-3 py-1 bg-blue-900/20 border-b border-blue-900/30">
                    <div className="flex justify-between text-xs text-blue-300 mb-1">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-900/20 p-2 text-xs text-red-400 border-b border-red-900/30 break-words">
                    {error}
                </div>
            )}

            <ConfirmationModal
                isOpen={confirmation.isOpen}
                title={confirmation.title}
                message={confirmation.message}
                onConfirm={confirmation.onConfirm}
                onCancel={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                confirmLabel="Delete"
                variant="danger"
            />

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-1 scrollbar-thin">
                {isCreatingFolder && (
                    <FileRow
                        file={{ name: '', isDirectory: true, size: 0, mtime: Date.now(), permissions: 0 }}
                        onNavigate={() => {}}
                        onDelete={() => {}}
                        onRename={() => {}}
                        onDownload={() => {}}
                        isRenaming={true}
                        onRenameSubmit={submitMkdir}
                        onRenameCancel={() => setIsCreatingFolder(false)}
                    />
                )}
                {files
                    .filter(file => showHiddenFiles || !file.name.startsWith('.'))
                    .map((file, idx) => (
                    <FileRow
                        key={`${file.name}-${idx}`}
                        file={file}
                        onNavigate={handleNavigate}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        onDownload={handleDownload}
                        isRenaming={renamingFileName === file.name}
                        onRenameSubmit={(newName) => submitRename(file, newName)}
                        onRenameCancel={() => setRenamingFileName(null)}
                    />
                ))}
                {files.length === 0 && !isCreatingFolder && !isLoading && (
                    <div className="text-center text-gray-600 text-xs py-8">
                        Empty directory
                    </div>
                )}
            </div>
        </div>
    );
};
