import React from 'react';
import { RemoteFile } from '../../types';
import { File, Folder, Download, Trash2 } from 'lucide-react';

interface FileListProps {
  files: RemoteFile[];
  onNavigate: (file: RemoteFile) => void;
  onDownload: (file: RemoteFile) => void;
  onDelete: (file: RemoteFile) => void;
}

export const FileList: React.FC<FileListProps> = ({ files, onNavigate, onDownload, onDelete }) => {

  // Sort: Directories first, then files
  const sortedFiles = [...files].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'd' ? -1 : 1;
  });

  const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-gray-900 border border-gray-700 rounded-md">
      <table className="w-full text-left border-collapse text-sm">
        <thead className="bg-gray-800 text-gray-400 sticky top-0 z-10">
          <tr>
            <th className="p-2 pl-4 font-medium w-8"></th>
            <th className="p-2 font-medium">Name</th>
            <th className="p-2 font-medium w-24">Size</th>
            <th className="p-2 font-medium w-32">Modified</th>
            <th className="p-2 font-medium w-20 text-right pr-4">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {sortedFiles.map((file, i) => (
            <tr
                key={file.name + i}
                className="hover:bg-gray-800/50 group cursor-default transition-colors"
                onDoubleClick={() => onNavigate(file)}
            >
              <td className="p-2 pl-4 text-gray-500">
                {file.type === 'd' ? <Folder size={16} className="text-blue-400" fill="currentColor" fillOpacity={0.2} /> : <File size={16} />}
              </td>
              <td className="p-2 text-gray-200 font-medium cursor-pointer" onClick={() => file.type === 'd' && onNavigate(file)}>
                {file.name}
              </td>
              <td className="p-2 text-gray-500 font-mono text-xs">
                {file.type === 'd' ? '-' : formatSize(file.size)}
              </td>
              <td className="p-2 text-gray-500 text-xs whitespace-nowrap">
                {new Date(file.date).toLocaleDateString()}
              </td>
              <td className="p-2 text-right pr-4">
                 <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.type === 'f' && (
                        <button onClick={() => onDownload(file)} className="p-1 hover:bg-gray-700 rounded text-blue-400" title="Download">
                            <Download size={14} />
                        </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onDelete(file); }} className="p-1 hover:bg-gray-700 rounded text-red-400" title="Delete">
                        <Trash2 size={14} />
                    </button>
                 </div>
              </td>
            </tr>
          ))}
          {files.length === 0 && (
             <tr>
                 <td colSpan={5} className="p-8 text-center text-gray-500">
                     Empty directory
                 </td>
             </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
