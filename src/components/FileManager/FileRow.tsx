import React from 'react';
import { FileEntry } from '../../services/fileService';
import { FileIcon } from './FileIcon';
import { MoreVertical, Download, Trash2, Edit2 } from 'lucide-react';

interface FileRowProps {
    file: FileEntry;
    onNavigate: (file: FileEntry) => void;
    onDelete: (file: FileEntry) => void;
    onRename: (file: FileEntry) => void;
    onDownload: (file: FileEntry) => void;
}

export const FileRow: React.FC<FileRowProps> = ({ file, onNavigate, onDelete, onRename, onDownload }) => {

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (ms: number) => {
        return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div
            className="group flex items-center gap-3 p-2 hover:bg-gray-800 rounded cursor-pointer transition-colors text-sm border-b border-gray-800/50 last:border-0"
            onDoubleClick={() => file.isDirectory && onNavigate(file)}
        >
            <div className="flex-shrink-0" onClick={() => file.isDirectory && onNavigate(file)}>
                <FileIcon name={file.name} isDirectory={file.isDirectory} />
            </div>

            <div className="flex-1 min-w-0 overflow-hidden" onClick={() => file.isDirectory && onNavigate(file)}>
                <div className="truncate text-gray-200 font-medium">{file.name}</div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    {!file.isDirectory && <span>{formatSize(file.size)}</span>}
                    <span>{formatDate(file.mtime)}</span>
                </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!file.isDirectory && (
                     <button onClick={(e) => { e.stopPropagation(); onDownload(file); }} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-blue-400" title="Download">
                        <Download size={14} />
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onRename(file); }} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-yellow-400" title="Rename">
                    <Edit2 size={14} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(file); }} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400" title="Delete">
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
};
