import React, { useState, useEffect, useRef } from 'react';
import { ConnectionManager } from './components/ConnectionManager';
import { Terminal } from './components/Terminal';
import { Button } from './components/Button';
import { SSHProfile, TerminalEntry, CommandGenerationResult, ConnectionStatus } from './types';
import { generateLinuxCommand } from './services/geminiService';
import { socket, connectSocket } from './services/sshService';
import { SAMPLE_PROMPTS } from './constants';
import { Send, Play, Cpu, AlertTriangle, Command, Link, Keyboard, ServerOff, Sparkles, Terminal as TerminalIcon } from 'lucide-react';

const API_URL = 'http://localhost:3001';

const App: React.FC = () => {
  // --- State ---
  const [profiles, setProfiles] = useState<SSHProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.Disconnected);
  const [detectedDistro, setDetectedDistro] = useState<string | null>(null);
  
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState('');
  const [pendingCommand, setPendingCommand] = useState<CommandGenerationResult | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false); // Indicates if a command is currently running on server
  const [inputMode, setInputMode] = useState<'ai' | 'direct'>('ai');
  const [backendError, setBackendError] = useState<string | null>(null);

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // --- Effects ---
  useEffect(() => {
    // Load profiles from backend
    fetch(`${API_URL}/profiles`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setProfiles(data);
          setBackendError(null);
        }
      })
      .catch(err => {
        console.error("Failed to load profiles:", err);
        setBackendError("Could not connect to backend server. Please ensure 'node server.js' is running on port 3001.");
      });
    
    // Initialize Socket Connection
    connectSocket();

    return () => {
      // Optional: disconnectSocket() if you want to cleanup on unmount
    };
  }, []);

  // Socket Event Listeners
  useEffect(() => {
    const onStatus = (status: string) => {
      if (status === 'connected') {
        const profile = profiles.find(p => p.id === activeProfileId);
        addLog('output', `Connected to ${profile?.host}`);
        setConnectionStatus(ConnectionStatus.Connected);
      } else if (status === 'disconnected') {
        setConnectionStatus(ConnectionStatus.Disconnected);
        setDetectedDistro(null);
        addLog('info', 'Disconnected.');
        setIsExecuting(false);
      }
    };

    const onDistro = (distro: string) => {
      setDetectedDistro(distro);
      addLog('info', `Detected OS: ${distro}`);
    };

    const onError = (msg: string) => {
      addLog('error', msg);
      if (msg.includes('Connection')) {
        setConnectionStatus(ConnectionStatus.Error);
      }
      setIsExecuting(false);
    };

    const onData = (data: string) => {
      setTerminalEntries(prev => {
        const last = prev[prev.length - 1];
        // If the last entry is an output, append to it for streaming effect
        if (last && last.type === 'output') {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + data }
          ];
        } else {
          // Otherwise start a new output block
          return [...prev, {
            id: crypto.randomUUID(),
            type: 'output',
            content: data,
            timestamp: Date.now()
          }];
        }
      });
    };

    const onFinished = () => {
      setIsExecuting(false);
      // Wait a bit before refocusing to allow render update
      setTimeout(() => inputRef.current?.focus(), 100);
    };

    socket.on('ssh:status', onStatus);
    socket.on('ssh:distro', onDistro);
    socket.on('ssh:error', onError);
    socket.on('ssh:data', onData);
    socket.on('ssh:finished', onFinished);
    
    socket.on('connect_error', (err) => {
        // Only set this if we haven't already set a more specific fetch error
        if (!backendError) {
             console.error("Socket connection error:", err);
        }
    });

    return () => {
      socket.off('ssh:status', onStatus);
      socket.off('ssh:distro', onDistro);
      socket.off('ssh:error', onError);
      socket.off('ssh:data', onData);
      socket.off('ssh:finished', onFinished);
      socket.off('connect_error');
    };
  }, [activeProfileId, profiles, backendError]);

  // When profile changes, disconnect current session
  useEffect(() => {
    if (connectionStatus === ConnectionStatus.Connected) {
      handleDisconnect();
    }
  }, [activeProfileId]);

  // --- Handlers ---
  
  const saveProfilesToBackend = async (newProfiles: SSHProfile[]) => {
    try {
      const res = await fetch(`${API_URL}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfiles)
      });
      if (!res.ok) throw new Error("Failed to save");
      setBackendError(null);
    } catch (err) {
      console.error("Failed to save profiles:", err);
      setBackendError("Failed to save profiles. Is the backend running?");
    }
  };

  const handleAddProfile = (profile: SSHProfile) => {
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfilesToBackend(updated);
    if (!activeProfileId) setActiveProfileId(profile.id);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    saveProfilesToBackend(updated);
    if (activeProfileId === id) setActiveProfileId(null);
  };

  const getActiveProfile = () => profiles.find(p => p.id === activeProfileId);

  const addLog = (type: TerminalEntry['type'], content: string) => {
    setTerminalEntries(prev => [...prev, {
      id: crypto.randomUUID(),
      type,
      content,
      timestamp: Date.now()
    }]);
  };

  const handleConnect = () => {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.privateKey) {
        addLog('error', 'Auth Failed: No private key provided in profile.');
        return;
    }

    setConnectionStatus(ConnectionStatus.Connecting);
    setTerminalEntries([]); // Clear terminal on new connection
    addLog('info', `Initiating connection to ${profile.host}...`);
    
    socket.emit('ssh:connect', {
      host: profile.host,
      username: profile.username,
      privateKey: profile.privateKey,
      passphrase: profile.passphrase
    });
  };

  const handleDisconnect = () => {
    socket.emit('ssh:disconnect');
    setConnectionStatus(ConnectionStatus.Disconnected);
    setDetectedDistro(null);
    setPendingCommand(null);
    setInput('');
    setIsExecuting(false);
  };

  // Handles ENTER key in the main input
  const handleInputSubmit = async () => {
    if (!input.trim() && !isExecuting) return;

    // INTERACTIVE MODE: Send input to running command
    if (isExecuting) {
       // Send the raw input plus a newline to the SSH stream
       socket.emit('ssh:input', input + '\n');
       
       // Optionally echo it locally so user sees what they typed, 
       // though PTY usually echoes back. We'll rely on PTY echo for now.
       // But if PTY echo is slow or off (e.g. password), we might not see it.
       // For better UX, we just clear the input box.
       setInput('');
       return;
    }

    // DIRECT MODE: Execute command directly
    if (inputMode === 'direct') {
      runDirectCommand(input);
      return;
    }

    // AI MODE: Generate command
    const profile = getActiveProfile();
    if (!profile) {
        addLog('error', 'No profile selected.');
        return;
    }
    
    if (connectionStatus !== ConnectionStatus.Connected) {
        addLog('error', 'Not connected. Please connect to the server first.');
        return;
    }

    setIsThinking(true);
    setPendingCommand(null);

    try {
      const result = await generateLinuxCommand(input, detectedDistro || 'Linux');
      setPendingCommand(result);
    } catch (error) {
      addLog('error', 'Command generation failed.');
    } finally {
      setIsThinking(false);
    }
  };

  const runDirectCommand = (cmd: string) => {
    if (connectionStatus !== ConnectionStatus.Connected) {
        addLog('error', 'Not connected. Please connect to the server first.');
        return;
    }

    setIsExecuting(true);
    addLog('command', cmd);

    // Start execution via socket
    socket.emit('ssh:execute', cmd);

    setPendingCommand(null);
    setInput('');
    // Focus input for potential interactive needs
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleExecute = () => {
    if (!pendingCommand) return;
    
    if (connectionStatus !== ConnectionStatus.Connected) {
        addLog('error', 'Connection lost.');
        setConnectionStatus(ConnectionStatus.Disconnected);
        return;
    }

    setIsExecuting(true);
    addLog('command', pendingCommand.command);
    
    // Start execution via socket
    socket.emit('ssh:execute', pendingCommand.command);
    
    setPendingCommand(null);
    setInput('');
    // Focus input for potential interactive needs
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCancel = () => {
    setPendingCommand(null);
    inputRef.current?.focus();
  };

  const activeProfile = getActiveProfile();
  const isConnected = connectionStatus === ConnectionStatus.Connected;

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <ConnectionManager 
        profiles={profiles}
        activeProfileId={activeProfileId}
        connectionStatus={connectionStatus}
        onSelectProfile={setActiveProfileId}
        onSaveProfile={handleAddProfile}
        onDeleteProfile={handleDeleteProfile}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Header - Minimalist */}
        <div className="h-12 border-b border-gray-800 flex items-center px-4 justify-between bg-gray-900 flex-shrink-0">
             <div className="flex items-center gap-2 text-gray-200 font-semibold">
                <Cpu size={18} className="text-blue-500"/> 
                TermiGen AI
             </div>
             
             {activeProfile && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Link size={12}/>
                      {activeProfile.username}@{activeProfile.host}
                    </div>
                    {detectedDistro && (
                      <div className="flex items-center gap-1 text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                        {detectedDistro}
                      </div>
                    )}
                </div>
             )}
        </div>

        {/* Error Banner */}
        {backendError && (
            <div className="bg-red-900/80 border-b border-red-500/50 px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top-2">
                <ServerOff className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-200">Backend Disconnected</h3>
                    <p className="text-xs text-red-300 mt-0.5">{backendError}</p>
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="text-xs bg-red-800 hover:bg-red-700 text-white px-3 py-1.5 rounded transition-colors"
                >
                    Retry
                </button>
            </div>
        )}

        {/* Terminal Area */}
        <div className="flex-1 p-4 pb-0 overflow-hidden flex flex-col bg-gray-900 min-h-0">
            <Terminal 
                entries={terminalEntries} 
                activeProfileName={activeProfile?.name} 
                status={connectionStatus}
            />
        </div>

        {/* Interaction Area */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex-shrink-0">
          <div className="max-w-4xl mx-auto space-y-4">
            
            {/* Pending Command Confirmation Card */}
            {pendingCommand && (
              <div className="bg-gray-800/90 backdrop-blur-sm border border-blue-500/30 rounded-lg p-4 shadow-xl animate-in slide-in-from-bottom-2">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                    <Command size={14}/> Generated Command
                  </h3>
                  {pendingCommand.dangerous && (
                    <span className="text-red-400 text-xs font-bold flex items-center gap-1 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/50">
                      <AlertTriangle size={12}/> HIGH RISK
                    </span>
                  )}
                </div>
                
                <div className="bg-black/50 p-3 rounded font-mono text-green-400 text-sm mb-3 border border-gray-700/50">
                  {pendingCommand.command}
                </div>
                
                <p className="text-gray-400 text-sm mb-4">
                  <span className="text-gray-500 font-medium">Action:</span> {pendingCommand.explanation}
                </p>

                <div className="flex justify-end gap-3">
                  <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
                  <Button 
                    variant={pendingCommand.dangerous ? 'danger' : 'primary'} 
                    size="sm" 
                    onClick={handleExecute}
                    className="w-32"
                  >
                    <Play size={14} className="mr-2"/> Execute
                  </Button>
                </div>
              </div>
            )}

            {/* Input Mode Toggle */}
            <div className="flex justify-end mb-2">
              <div className="bg-gray-800 p-1 rounded-lg flex text-xs font-medium border border-gray-700">
                <button
                  onClick={() => setInputMode('ai')}
                  disabled={isExecuting}
                  className={`px-3 py-1 rounded flex items-center gap-2 transition-colors ${inputMode === 'ai' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'} ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Sparkles size={14} /> AI
                </button>
                <button
                  onClick={() => setInputMode('direct')}
                  disabled={isExecuting}
                  className={`px-3 py-1 rounded flex items-center gap-2 transition-colors ${inputMode === 'direct' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'} ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <TerminalIcon size={14} /> Direct
                </button>
              </div>
            </div>

            {/* Input Area - Changes based on state */}
            <div className={`relative transition-all duration-200 ${pendingCommand ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                {isThinking ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                ) : isExecuting ? (
                    <Keyboard size={18} className="text-yellow-500 animate-pulse" />
                ) : (
                    <div className="text-gray-500 font-mono text-lg">{'>'}</div>
                )}
              </div>
              
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleInputSubmit();
                    }
                }}
                disabled={(!isConnected && !isExecuting) || !!backendError}
                className={`
                  w-full text-sm rounded-lg pl-10 pr-12 py-3 outline-none shadow-sm transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-800/50
                  ${isExecuting 
                    ? 'bg-gray-800 border-2 border-yellow-500/50 text-yellow-100 focus:border-yellow-500 placeholder-yellow-500/30' 
                    : inputMode === 'direct'
                      ? 'bg-gray-800 border border-green-700/50 text-green-100 focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-gray-500'
                      : 'bg-gray-800 border border-gray-700 text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500'
                  }
                `}
                placeholder={
                    !!backendError
                        ? "Backend server disconnected"
                        : !activeProfile 
                            ? "Select a profile to start..." 
                            : isExecuting
                               ? "Command running. Type input here (e.g., passwords, yes/no)..."
                               : !isConnected 
                                  ? "Connect to server to run commands..." 
                                  : inputMode === 'direct'
                                    ? `Enter Linux command for ${activeProfile.host}...`
                                    : `Describe a task for ${activeProfile.host}...`
                }
              />
              
              <button 
                onClick={handleInputSubmit}
                disabled={!input.trim() || isThinking || (!isConnected && !isExecuting) || !!backendError}
                className={`
                  absolute inset-y-1 right-1 p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${isExecuting
                    ? 'text-yellow-500 hover:bg-yellow-900/30'
                    : inputMode === 'direct'
                      ? 'text-green-500 hover:bg-green-900/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'}
                `}
              >
                <Send size={18} />
              </button>
            </div>

            {/* Quick Prompts (Only show if empty input and no pending and NOT executing) */}
            {!input && !pendingCommand && isConnected && !isExecuting && !backendError && (
              <div className="flex flex-wrap gap-2 justify-center">
                {SAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-full border border-gray-700 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            
            {/* Execution status helper */}
            {isExecuting && (
                <div className="text-center text-xs text-yellow-500/80 animate-pulse">
                    Interactive Mode Active: Input is sent directly to the server.
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;