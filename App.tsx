import React, { useState, useEffect, useRef } from 'react';
import { ConnectionManager } from './components/ConnectionManager';
import { Terminal } from './components/Terminal';
import { Button } from './components/Button';
import { TaskSidebar } from './components/TaskSidebar';
import { SSHProfile, TerminalEntry, CommandGenerationResult, ConnectionStatus, CommandStep, CommandStatus } from './types';
import { generateLinuxCommand, generateCommandFix } from './services/geminiService';
import { socket, connectSocket } from './services/sshService';
import { SAMPLE_PROMPTS } from './constants';
import { Send, Play, Cpu, AlertTriangle, Command, Link, Keyboard, ServerOff, Sparkles, Terminal as TerminalIcon, Pause, RefreshCw, XCircle, SkipForward } from 'lucide-react';

const API_URL = 'http://localhost:3001';

const App: React.FC = () => {
  // --- State ---
  const [profiles, setProfiles] = useState<SSHProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.Disconnected);
  const [detectedDistro, setDetectedDistro] = useState<string | null>(null);
  
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState('');

  // New State for Command Staging and Execution
  const [commandQueue, setCommandQueue] = useState<CommandStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<'idle' | 'running' | 'paused' | 'error'>('idle');
  const [suggestedFix, setSuggestedFix] = useState<CommandStep | null>(null);
  const [currentOutput, setCurrentOutput] = useState(''); // Accumulate output for fix generation

  const [isThinking, setIsThinking] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false); // Indicates if user is manually typing in "Direct" mode or handling interactive input
  const [inputMode, setInputMode] = useState<'ai' | 'direct'>('ai');
  const [backendError, setBackendError] = useState<string | null>(null);

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<CommandStep[]>([]); // To access latest queue in callbacks

  // Sync ref with state
  useEffect(() => {
    queueRef.current = commandQueue;
  }, [commandQueue]);

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
        // Clear state on disconnect
        setCommandQueue([]);
        setActiveStepId(null);
        setExecutionState('idle');
        setSuggestedFix(null);
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
    };

    const onData = (data: string) => {
      // Accumulate output for current command context
      if (executionState === 'running') {
        setCurrentOutput(prev => prev + data);
      }

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

    const onFinished = async ({ code }: { code: number }) => {
      // Wait a bit before refocusing to allow render update
      setTimeout(() => inputRef.current?.focus(), 100);

      // Handle Command Queue Progression
      handleCommandFinished(code);
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
  }, [activeProfileId, profiles, backendError, executionState]); // Added executionState dep to ensure onData captures correctly

  // When profile changes, disconnect current session
  useEffect(() => {
    if (connectionStatus === ConnectionStatus.Connected) {
      handleDisconnect();
    }
  }, [activeProfileId]);

  // Sync Queue to Backend on Change (Pause/Stop logic)
  useEffect(() => {
    if (connectionStatus === ConnectionStatus.Connected && commandQueue.length > 0) {
      socket.emit('session:update_queue', commandQueue);
    }
  }, [commandQueue, connectionStatus]);

  // --- Logic ---

  const handleCommandFinished = async (code: number) => {
    if (isInteractive) {
       setIsInteractive(false);
       return;
    }

    // Use ref to get latest state in callback
    const currentQueue = queueRef.current;
    const activeIndex = currentQueue.findIndex(s => s.status === CommandStatus.Running);

    if (activeIndex === -1) return; // No running command found?

    const activeStep = currentQueue[activeIndex];

    if (code === 0) {
       // Success
       updateStepStatus(activeStep.id, CommandStatus.Success);
       setCurrentOutput(''); // Reset output buffer

       // If we are in "Run All" mode (implied if not paused), run next
       // But checking state here is tricky because React batching.
       // We'll rely on a small timeout or function call to proceed.
       // Simple logic: If we have next step, and we haven't been told to pause (via user interaction which would set state), continue.
       // However, we need to know if we should "Run All" or just "Step".
       // For this MVP, let's assume "Run All" is the default behavior once started, unless paused.

       // We need to check if user clicked "Pause". State updates might be pending.
       // Let's rely on a state checker in the next tick.
       setTimeout(() => {
          setExecutionState(prevState => {
             if (prevState === 'paused') return 'paused'; // User paused manually

             // Check if there is a next step
             const nextStep = currentQueue[activeIndex + 1];
             if (nextStep) {
               // Execute next
               executeStep(nextStep.id);
               return 'running';
             } else {
               // All done
               addLog('info', 'All commands completed successfully.');
               return 'idle';
             }
          });
       }, 50);

    } else {
       // Error
       updateStepStatus(activeStep.id, CommandStatus.Error);
       setExecutionState('error');

       // Trigger Auto-Fix
       addLog('error', `Command failed with exit code ${code}. Generating fix...`);
       setIsThinking(true);

       const profile = getActiveProfile();
       if (profile) {
           try {
             // Use the accumulated output 'currentOutput'
             const fix = await generateCommandFix(activeStep.command, currentOutput, detectedDistro || 'Linux');
             setSuggestedFix(fix);
           } catch (e) {
             addLog('error', 'Failed to generate fix suggestion.');
           } finally {
             setIsThinking(false);
           }
       }
    }
  };

  const executeStep = (stepId: string) => {
    const step = queueRef.current.find(s => s.id === stepId);
    if (!step) return;

    setActiveStepId(stepId);
    updateStepStatus(stepId, CommandStatus.Running);
    setExecutionState('running');
    setCurrentOutput(''); // Clear buffer for new command

    addLog('command', step.command);
    socket.emit('ssh:execute', step.command);
  };

  const updateStepStatus = (id: string, status: CommandStatus) => {
    setCommandQueue(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const handleStartQueue = () => {
    // Find first pending step
    const firstPending = commandQueue.find(s => s.status === CommandStatus.Pending || s.status === CommandStatus.Error);
    if (firstPending) {
        executeStep(firstPending.id);
    }
  };

  const handlePause = () => {
    setExecutionState('paused');
    // We can't actually pause a running shell command easily without sending signals,
    // but we can stop the loop from executing the *next* command.
    addLog('info', 'Execution paused. Remaining commands saved.');
  };

  const handleAbort = () => {
      setCommandQueue([]);
      setActiveStepId(null);
      setExecutionState('idle');
      setSuggestedFix(null);
      addLog('info', 'Execution aborted.');
  };

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
    setCommandQueue([]);
    setExecutionState('idle');
    setDetectedDistro(null);
    setInput('');
    setIsInteractive(false);
  };

  // Handles ENTER key in the main input
  const handleInputSubmit = async () => {
    if (!input.trim() && !isInteractive && executionState === 'idle') {
        // Allow generating new commands only if idle
    } else if (!input.trim() && !isInteractive) {
        return;
    }

    // INTERACTIVE MODE: Send input to running command
    if (isInteractive || executionState === 'running') {
       socket.emit('ssh:input', input + '\n');
       setInput('');
       return;
    }

    // DIRECT MODE: Execute command directly
    if (inputMode === 'direct') {
      runDirectCommand(input);
      return;
    }

    // AI MODE: Generate command queue
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
    setCommandQueue([]);
    setSuggestedFix(null);

    try {
      const result = await generateLinuxCommand(input, detectedDistro || 'Linux');
      setCommandQueue(result.steps);
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

    setIsInteractive(true);
    addLog('command', cmd);

    // Start execution via socket
    socket.emit('ssh:execute', cmd);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const applyFix = () => {
    if (!suggestedFix || !activeStepId) return;
    
    // Replace the failed command with the fix in the queue
    setCommandQueue(prev => prev.map(s => {
        if (s.id === activeStepId) {
            // Keep the ID but update content to preserve queue order?
            // Better to update content and reset status.
            return {
                ...s,
                command: suggestedFix.command,
                explanation: suggestedFix.explanation,
                dangerous: suggestedFix.dangerous,
                status: CommandStatus.Pending
            };
        }
        return s;
    }));
    
    setSuggestedFix(null);
    setExecutionState('idle'); // Ready to retry
    // Auto-retry immediately? Or let user click run?
    // Let's let user click run (or we can just call handleStartQueue)
  };

  const skipStep = () => {
      if (!activeStepId) return;
      updateStepStatus(activeStepId, CommandStatus.Skipped);
      setSuggestedFix(null);
      setExecutionState('idle'); // Pause after skip, let user resume
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
                SSH Engine
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

        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Terminal Area */}
            <div className="flex-1 p-4 pb-0 overflow-hidden flex flex-col bg-gray-900 min-h-0">
                <Terminal
                    entries={terminalEntries}
                    activeProfileName={activeProfile?.name}
                    status={connectionStatus}
                />
            </div>

            {/* Right Sidebar: Command Queue */}
            {commandQueue.length > 0 && (
                <TaskSidebar
                    steps={commandQueue}
                    activeStepId={activeStepId}
                />
            )}
        </div>

        {/* Interaction Area */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex-shrink-0 z-20">
          <div className="max-w-4xl mx-auto space-y-4">
            
            {/* Control Panel for Execution */}
            {commandQueue.length > 0 && !suggestedFix && (
                <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <div className="text-sm text-gray-400">
                        {executionState === 'running' ? (
                            <span className="text-blue-400 flex items-center gap-2">
                                <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                                Executing step...
                            </span>
                        ) : executionState === 'paused' ? (
                            <span className="text-yellow-400">Paused</span>
                        ) : (
                            <span>Ready to execute {commandQueue.filter(s => s.status === CommandStatus.Pending).length} steps</span>
                        )}
                    </div>

                    <div className="flex gap-2">
                         {executionState === 'running' ? (
                             <Button variant="secondary" size="sm" onClick={handlePause}>
                                 <Pause size={14} className="mr-2"/> Stop
                             </Button>
                         ) : (
                             <>
                                <Button variant="ghost" size="sm" onClick={handleAbort}>Abort</Button>
                                <Button variant="primary" size="sm" onClick={handleStartQueue}>
                                    <Play size={14} className="mr-2"/>
                                    {executionState === 'paused' ? 'Resume' : 'Run All'}
                                </Button>
                             </>
                         )}
                    </div>
                </div>
            )}

            {/* Fix Suggestion Card */}
            {suggestedFix && (
              <div className="bg-gray-800/90 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 shadow-xl animate-in slide-in-from-bottom-2">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={14}/> Execution Error
                  </h3>
                </div>
                
                <p className="text-gray-300 text-sm mb-3">
                   The command failed. AI suggests a fix:
                </p>

                <div className="bg-black/50 p-3 rounded font-mono text-green-400 text-sm mb-3 border border-gray-700/50">
                  {suggestedFix.command}
                </div>
                
                <p className="text-gray-400 text-sm mb-4">
                  <span className="text-gray-500 font-medium">Reasoning:</span> {suggestedFix.explanation}
                </p>

                <div className="flex justify-end gap-3">
                  <Button variant="ghost" size="sm" onClick={handleAbort}>Abort</Button>
                  <Button variant="secondary" size="sm" onClick={skipStep}>
                     <SkipForward size={14} className="mr-2"/> Skip Step
                  </Button>
                  <Button 
                    variant={suggestedFix.dangerous ? 'danger' : 'primary'}
                    size="sm" 
                    onClick={applyFix}
                  >
                    <RefreshCw size={14} className="mr-2"/> Apply Fix
                  </Button>
                </div>
              </div>
            )}

            {/* Input Mode Toggle - Hide during active execution queue unless paused/idle */}
            {commandQueue.length === 0 && (
                <div className="flex justify-end mb-2">
                <div className="bg-gray-800 p-1 rounded-lg flex text-xs font-medium border border-gray-700">
                    <button
                    onClick={() => {
                        setInputMode('ai');
                        setIsInteractive(false);
                    }}
                    className={`px-3 py-1 rounded flex items-center gap-2 transition-colors ${inputMode === 'ai' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                    <Sparkles size={14} /> AI
                    </button>
                    <button
                    onClick={() => setInputMode('direct')}
                    className={`px-3 py-1 rounded flex items-center gap-2 transition-colors ${inputMode === 'direct' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                    <TerminalIcon size={14} /> Direct
                    </button>
                </div>
                </div>
            )}

            {/* Input Area */}
            <div className={`relative transition-all duration-200 ${isThinking ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                {isThinking ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                ) : isInteractive ? (
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
                disabled={(!isConnected && !isInteractive) || !!backendError}
                className={`
                  w-full text-sm rounded-lg pl-10 pr-12 py-3 outline-none shadow-sm transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-800/50
                  ${isInteractive
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
                            : isInteractive
                               ? "Command running. Type input here..."
                               : !isConnected 
                                  ? "Connect to server to run commands..." 
                                  : inputMode === 'direct'
                                    ? `Enter Linux command for ${activeProfile.host}...`
                                    : `Describe a task for ${activeProfile.host}...`
                }
              />
              
              <button 
                onClick={handleInputSubmit}
                disabled={!input.trim() || isThinking || (!isConnected && !isInteractive) || !!backendError}
                className={`
                  absolute inset-y-1 right-1 p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${isInteractive
                    ? 'text-yellow-500 hover:bg-yellow-900/30'
                    : inputMode === 'direct'
                      ? 'text-green-500 hover:bg-green-900/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'}
                `}
              >
                <Send size={18} />
              </button>
            </div>

            {/* Quick Prompts */}
            {!input && commandQueue.length === 0 && isConnected && !isInteractive && !backendError && (
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
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;