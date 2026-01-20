import React from 'react';
import { Folder, File, FileText, Image, Code, Music, Video, Archive } from 'lucide-react';

interface FileIconProps {
    name: string;
    isDirectory: boolean;
    size?: number;
}

export const FileIcon: React.FC<FileIconProps> = ({ name, isDirectory, size = 18 }) => {
    if (isDirectory) return <Folder size={size} className="text-blue-400 fill-blue-400/20" />;

    const ext = name.split('.').pop()?.toLowerCase();

    switch (ext) {
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
            return <Image size={size} className="text-purple-400" />;
        case 'js':
        case 'ts':
        case 'tsx':
        case 'jsx':
        case 'py':
        case 'html':
        case 'css':
        case 'json':
            return <Code size={size} className="text-yellow-400" />;
        case 'mp3':
        case 'wav':
            return <Music size={size} className="text-pink-400" />;
        case 'mp4':
        case 'mkv':
        case 'mov':
            return <Video size={size} className="text-red-400" />;
        case 'zip':
        case 'tar':
        case 'gz':
        case 'rar':
            return <Archive size={size} className="text-orange-400" />;
        case 'txt':
        case 'md':
        case 'log':
            return <FileText size={size} className="text-gray-400" />;
        default:
            return <File size={size} className="text-gray-500" />;
    }
};
