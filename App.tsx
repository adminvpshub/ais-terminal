import React, { useState, useEffect, useRef } from 'react';
import { ConnectionManager } from './components/ConnectionManager';
import { Terminal } from './components/Terminal';
import { Button } from './components/Button';
import { TaskSidebar } from './components/TaskSidebar';
import { SSHProfile, TerminalEntry, CommandGenerationResult, ConnectionStatus, CommandStep, CommandStatus } from './types';
import { generateLinuxCommand, generateCommandFix } from './services/geminiService';
import { socket, connectSocket } from './services/sshService';
import { SAMPLE_PROMPTS } from './constants';
import { Send, Play, Cpu, AlertTriangle, Command, Link, Keyboard, ServerOff, Sparkles, Terminal as TerminalIcon, Pause, RefreshCw, XCircle, SkipForward, Type } from 'lucide-react';

const API_URL = 'http://localhost:3001';

const App: React.FC = () => {
  // --- State ---
  const [profiles, setProfiles] = useState<SSHProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.Disconnected);
  const [detectedDistro, setDetectedDistro] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(14);
  
  // Note: We no longer render terminalEntries, but keep this state if needed for logs/history in future
  // or simple side-logging. For now, we'll use it to accumulate data for AI context.
  const [sessionLog, setSessionLog] = useState('');
  const [input, setInput] = useState('');

  // New State for Prompts visibility
  const [showPrompts, setShowPrompts] = useState(false);

  // New State for Command Staging and Execution
  const [commandQueue, setCommandQueue] = useState<CommandStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<'idle' | 'running' | 'paused' | 'error'>('idle');
  const [runMode, setRunMode] = useState<'all' | 'single'>('all'); // Track execution mode
  const [suggestedFix, setSuggestedFix] = useState<CommandStep | null>(null);
  const [currentOutput, setCurrentOutput] = useState(''); // Accumulate output for fix generation

  const [isThinking, setIsThinking] = useState(false);
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
    // Load font size
    const savedFontSize = localStorage.getItem('terminal_font_size');
    if (savedFontSize) {
        setFontSize(parseInt(savedFontSize, 10));
    }

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

  // Save font size
  useEffect(() => {
      localStorage.setItem('terminal_font_size', fontSize.toString());
  }, [fontSize]);

  // Socket Event Listeners
  useEffect(() => {
    const onStatus = (status: string) => {
      if (status === 'connected') {
        const profile = profiles.find(p => p.id === activeProfileId);
        setConnectionStatus(ConnectionStatus.Connected);
        setShowPrompts(true); // Reset prompts visibility on new connection
      } else if (status === 'disconnected') {
        setConnectionStatus(ConnectionStatus.Disconnected);
        setDetectedDistro(null);
        // Clear state on disconnect
        setCommandQueue([]);
        setActiveStepId(null);
        setExecutionState('idle');
        setSuggestedFix(null);
        setShowPrompts(false);
      }
    };

    const onDistro = (distro: string) => {
      setDetectedDistro(distro);
    };

    const onError = (msg: string) => {
      if (msg.includes('Connection')) {
        setConnectionStatus(ConnectionStatus.Error);
      }
    };

    const onData = (data: string) => {
      // Accumulate output for current command context (AI Fix)
      if (executionState === 'running') {
        setCurrentOutput(prev => prev + data);
      }

      // Accumulate total session log (context)
      setSessionLog(prev => (prev + data).slice(-50000)); // Keep last 50k chars
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
  }, [activeProfileId, profiles, backendError, executionState, detectedDistro]);

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

       // Check if we should continue running (Run All mode) or stop (Single mode)
       if (runMode === 'single') {
           setExecutionState('idle');
           addLog('info', 'Step completed.');
           return;
       }

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
               return 'idle';
             }
          });
       }, 50);

    } else {
       // Error
       updateStepStatus(activeStep.id, CommandStatus.Error);
       setExecutionState('error');

       // Trigger Auto-Fix
       setIsThinking(true);

       const profile = getActiveProfile();
       if (profile) {
           try {
             // Use the accumulated output 'currentOutput'
             const fix = await generateCommandFix(activeStep.command, currentOutput, detectedDistro || 'Linux');
             setSuggestedFix(fix);
           } catch (e) {
             console.error('Failed to generate fix suggestion', e);
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

    socket.emit('ssh:execute', step.command);
  };

  const updateStepStatus = (id: string, status: CommandStatus) => {
    setCommandQueue(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const handleStartQueue = () => {
    setRunMode('all');
    // Find first pending step
    const firstPending = commandQueue.find(s => s.status === CommandStatus.Pending || s.status === CommandStatus.Error);
    if (firstPending) {
        executeStep(firstPending.id);
    }
  };

  const handleRunSingleStep = (stepId: string) => {
    // Only allow if not currently executing
    if (executionState === 'running') return;

    setRunMode('single');
    executeStep(stepId);
  };

  const handlePause = () => {
    setExecutionState('paused');
  };

  const handleAbort = () => {
      setCommandQueue([]);
      setActiveStepId(null);
      setExecutionState('idle');
      setSuggestedFix(null);
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setFontSize(parseInt(e.target.value, 10));
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

  const handleConnect = () => {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.privateKey) {
        console.error('Auth Failed: No private key provided in profile.');
        return;
    }

    setConnectionStatus(ConnectionStatus.Connecting);
    
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
  };

  // Handles ENTER key in the main input
  const handleInputSubmit = async () => {
    if (!input.trim()) return;

    // DIRECT MODE: Execute command directly (via shell injection)
    // Note: With the new Xterm, users can type directly into the terminal.
    // This input box is now mostly for AI commands or quick "macro" sending.
    if (inputMode === 'direct') {
      setShowPrompts(false); // Hide prompts on first interaction
      runDirectCommand(input);
      return;
    }

    // AI MODE: Generate command queue
    const profile = getActiveProfile();
    if (!profile) return;
    
    if (connectionStatus !== ConnectionStatus.Connected) return;

    setIsThinking(true);
    setCommandQueue([]);
    setSuggestedFix(null);
    setShowPrompts(false); // Hide prompts on first interaction

    try {
      const result = await generateLinuxCommand(input, detectedDistro || 'Linux');
      setCommandQueue(result.steps);
    } catch (error) {
      console.error('Command generation failed', error);
    } finally {
      setIsThinking(false);
    }
  };

  const runDirectCommand = (cmd: string) => {
    if (connectionStatus !== ConnectionStatus.Connected) return;

    // We can use ssh:execute to send it with marker, or just inject it as input.
    // Injecting as input is safer for interactive tools, but we don't get 'finished' event.
    // If user explicitly uses "Direct" box, maybe they want the command history/AI tracking?
    // Let's use ssh:execute so it behaves like a "run command" action.
    socket.emit('ssh:execute', cmd);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const applyFix = () => {
    if (!suggestedFix || !activeStepId) return;
    
    // Replace the failed command with the fix in the queue
    setCommandQueue(prev => prev.map(s => {
        if (s.id === activeStepId) {
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
             
             <div className="flex items-center gap-4">
                 {/* Font Size Selector */}
                 <div className="flex items-center gap-2">
                     <Type size={14} className="text-gray-500"/>
                     <select
                        value={fontSize}
                        onChange={handleFontSizeChange}
                        className="bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                     >
                        {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(size => (
                            <option key={size} value={size}>{size}px</option>
                        ))}
                     </select>
                 </div>

                 {activeProfile && (
                    <div className="flex items-center gap-3 text-xs text-gray-500 border-l border-gray-800 pl-4">
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
            <div className="flex-1 p-4 pb-4 overflow-hidden flex flex-col bg-gray-900 min-h-0">
                <Terminal socket={socket} fontSize={fontSize} />
            </div>

            {/* Right Sidebar: Command Queue */}
            {commandQueue.length > 0 && (
                <TaskSidebar
                    steps={commandQueue}
                    activeStepId={activeStepId}
                    onRunStep={handleRunSingleStep}
                    isExecuting={executionState === 'running'}
                />
            )}
        </div>

        {/* Interaction Area */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex-shrink-0 z-20">
          <div className="max-w-4xl mx-auto space-y-4">
            
            {/* Control Panel / Input Wrapper */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">

                {/* Input Area */}
                <div className={`relative flex-1 transition-all duration-200 ${isThinking ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    {isThinking ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
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
                    disabled={(!isConnected && inputMode !== 'ai') || !!backendError} // Disable direct input if not connected, but allow AI input
                    className={`
                      w-full text-sm rounded-lg pl-10 pr-12 py-3 outline-none shadow-sm transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-800/50
                      ${inputMode === 'direct'
                          ? 'bg-gray-800 border border-green-700/50 text-green-100 focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-gray-500'
                          : 'bg-gray-800 border border-gray-700 text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500'
                      }
                    `}
                    placeholder={
                        !!backendError
                            ? "Backend server disconnected"
                            : !activeProfile
                                ? "Select a profile to start..."
                                : !isConnected
                                      ? "Connect to server to run commands..."
                                      : inputMode === 'direct'
                                        ? `Send a command to ${activeProfile.host}...`
                                        : `Describe a task for ${activeProfile.host}...`
                    }
                  />

                  <button
                    onClick={handleInputSubmit}
                    disabled={!input.trim() || isThinking || (!isConnected && inputMode !== 'ai') || !!backendError}
                    className={`
                      absolute inset-y-1 right-1 p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                      ${inputMode === 'direct'
                          ? 'text-green-500 hover:bg-green-900/30'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'}
                    `}
                  >
                    <Send size={18} />
                  </button>
                </div>

                {/* Execution Controls (Only show if queue active or input mode toggle needed) */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    {commandQueue.length > 0 && !suggestedFix ? (
                        <div className="flex items-center gap-2 bg-gray-800/50 p-1.5 rounded-lg border border-gray-700">
                             <div className="text-xs text-gray-400 px-2 hidden lg:block">
                                {executionState === 'running' ? (
                                    <span className="text-blue-400 flex items-center gap-2">
                                        <span className="animate-spin rounded-full h-2 w-2 border-b-2 border-current"></span>
                                        Running
                                    </span>
                                ) : executionState === 'paused' ? (
                                    <span className="text-yellow-400">Paused</span>
                                ) : (
                                    <span>{commandQueue.filter(s => s.status === CommandStatus.Pending).length} Ready</span>
                                )}
                            </div>

                             {executionState === 'running' ? (
                                 <Button variant="secondary" size="sm" onClick={handlePause} className="h-9">
                                     <Pause size={14} className="mr-1"/> Stop
                                 </Button>
                             ) : (
                                 <>
                                    <Button variant="ghost" size="sm" onClick={handleAbort} className="h-9">Abort</Button>
                                    <Button variant="primary" size="sm" onClick={handleStartQueue} className="h-9">
                                        <Play size={14} className="mr-1"/>
                                        {executionState === 'paused' ? 'Resume' : 'Run All'}
                                    </Button>
                                 </>
                             )}
                        </div>
                    ) : (
                        // Input Mode Toggle
                         <div className="bg-gray-800 p-1 rounded-lg flex text-xs font-medium border border-gray-700 h-[42px] items-center">
                            <button
                            onClick={() => {
                                setInputMode('ai');
                            }}
                            className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors h-full ${inputMode === 'ai' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                            <Sparkles size={14} /> AI
                            </button>
                            <button
                            onClick={() => setInputMode('direct')}
                            className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors h-full ${inputMode === 'direct' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                            <TerminalIcon size={14} /> Direct
                            </button>
                        </div>
                    )}
                </div>

            </div>

            {/* Fix Suggestion Card */}
            {suggestedFix && (
              <div className="bg-gray-800/90 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 shadow-xl animate-in slide-in-from-bottom-2 mt-2">
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

            {/* Quick Prompts */}
            {!input && commandQueue.length === 0 && isConnected && !backendError && showPrompts && (
              <div className="flex flex-wrap gap-2 justify-center mt-2">
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
