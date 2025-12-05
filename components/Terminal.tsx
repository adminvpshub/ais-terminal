import React, { useEffect, useRef } from 'react';
import { TerminalEntry, ConnectionStatus } from '../types';
import { Terminal as TerminalIcon, Wifi, WifiOff, Loader2 } from 'lucide-react';

interface TerminalProps {
  entries: TerminalEntry[];
  activeProfileName?: string;
  status: ConnectionStatus;
}

export const Terminal: React.FC<TerminalProps> = ({ entries, activeProfileName, status }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const getStatusColor = () => {
    switch (status) {
      case ConnectionStatus.Connected: return 'text-terminal-green';
      case ConnectionStatus.Connecting: return 'text-terminal-yellow';
      case ConnectionStatus.Error: return 'text-terminal-red';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case ConnectionStatus.Connected: return 'Connected';
      case ConnectionStatus.Connecting: return 'Connecting...';
      case ConnectionStatus.Error: return 'Connection Failed';
      default: return 'Disconnected';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case ConnectionStatus.Connected: return <Wifi size={14} />;
      case ConnectionStatus.Connecting: return <Loader2 size={14} className="animate-spin" />;
      case ConnectionStatus.Error: return <WifiOff size={14} />;
      default: return <WifiOff size={14} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-terminal-bg font-mono text-sm border border-gray-700 rounded-lg overflow-hidden shadow-2xl">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          <span className="ml-3 text-gray-400 text-xs flex items-center gap-2">
            <TerminalIcon size={12} />
            {activeProfileName ? `ssh ${activeProfileName}` : 'termigen-client'}
          </span>
        </div>
        
        {/* Status Indicator */}
        <div className={`flex items-center gap-2 text-xs font-medium border px-2 py-0.5 rounded ${getStatusColor()} border-gray-700 bg-gray-900/50`}>
          {getStatusIcon()}
          {getStatusText()}
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {entries.length === 0 && (
          <div className="text-gray-500 italic mt-4 text-center opacity-50">
            TermiGen SSH Client v1.0.0
            <br />
            Select a host profile to connect.
          </div>
        )}
        
        {entries.map((entry) => (
          <div key={entry.id} className="break-words">
            {entry.type === 'command' && (
              <div className="flex items-start text-terminal-text mt-3">
                <span className="mr-2 select-none text-terminal-green font-bold">➜</span>
                <span className="font-bold">{entry.content}</span>
              </div>
            )}
            
            {entry.type === 'output' && (
              <div className="text-gray-300 whitespace-pre-wrap font-mono opacity-90 leading-relaxed">
                {entry.content}
              </div>
            )}
            
            {entry.type === 'error' && (
              <div className="text-terminal-red whitespace-pre-wrap font-mono">
                {entry.content}
              </div>
            )}
            
            {entry.type === 'info' && (
              <div className="text-terminal-dim italic text-xs mt-1 mb-1">
                {entry.content}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};