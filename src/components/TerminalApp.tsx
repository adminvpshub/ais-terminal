import React, { useState, useEffect, useRef } from 'react';
import { ConnectionManager } from './ConnectionManager';
import { Terminal } from './Terminal';
import { Button } from './Button';
import { TaskSidebar } from './TaskSidebar';
import { SetupPinModal, PinEntryModal } from './AuthModals';
import { SuggestionModal } from './SuggestionModal';
import { ApiKeyModal } from './ApiKeyModal';
import { SSHProfile, TerminalEntry, CommandGenerationResult, ConnectionStatus, CommandStep, CommandStatus, CommandFix } from '../types';
import { generateLinuxCommand, generateCommandFix } from '../services/geminiService';
import { socket, connectSocket } from '../services/sshService';
import { SAMPLE_PROMPTS } from '../constants';
import { Send, Play, Cpu, AlertTriangle, Command, Link, Keyboard, ServerOff, Sparkles, Terminal as TerminalIcon, Pause, RefreshCw, XCircle, SkipForward, Type } from 'lucide-react';

const API_URL = 'http://localhost:3001';

const TerminalApp: React.FC = () => {
  // --- State ---
  const [profiles, setProfiles] = useState<SSHProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null); // "Selected" profile in sidebar
  const [connectedProfileId, setConnectedProfileId] = useState<string | null>(null); // Actually "Connected" profile
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
  const [suggestedFix, setSuggestedFix] = useState<CommandFix | null>(null);
  const [currentOutput, setCurrentOutput] = useState(''); // Accumulate output for fix generation

  const [isThinking, setIsThinking] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Auth State
  const [isPinSetup, setIsPinSetup] = useState<boolean>(true); // Assume true initially to avoid flash
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showPinEntryModal, setShowPinEntryModal] = useState(false);
  const [cachedPin, setCachedPin] = useState<string | null>(null);
  const [pendingConnectProfileId, setPendingConnectProfileId] = useState<string | null>(null);

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<CommandStep[]>([]); // To access latest queue in callbacks

  // Sync ref with state
  useEffect(() => {
    queueRef.current = commandQueue;
  }, [commandQueue]);

  // --- Effects ---
  useEffect(() => {
    // Check Auth Status
    fetch(`${API_URL}/auth/status`)
        .then(res => res.json())
        .then(data => {
            setIsPinSetup(data.isSetup);
            if (!data.isSetup) {
                setShowSetupModal(true);
            }
        })
        .catch(err => console.error("Auth check failed", err));

    // Load font size
    const savedFontSize = localStorage.getItem('terminal_font_size');
    if (savedFontSize) {
        setFontSize(parseInt(savedFontSize, 10));
    }

    // Load profiles from backend
    loadProfiles();

    // Initialize Socket Connection
    connectSocket();

    return () => {
      // Optional: disconnectSocket() if you want to cleanup on unmount
    };
  }, []);

  const loadProfiles = () => {
    fetch(`${API_URL}/profiles`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          // Deduplicate profiles by ID, keeping the latest one
          const seen = new Set();
          const uniqueProfiles = [];
          for (let i = data.length - 1; i >= 0; i--) {
              const p = data[i];
              if (!seen.has(p.id)) {
                  seen.add(p.id);
                  uniqueProfiles.unshift(p);
              }
          }
          setProfiles(uniqueProfiles);
          setBackendError(null);
        }
      })
      .catch(err => {
        console.error("Failed to load profiles:", err);
        setBackendError("Could not connect to backend server. Please ensure 'node server.js' is running on port 3001.");
      });
  };

  // Save font size
  useEffect(() => {
      localStorage.setItem('terminal_font_size', fontSize.toString());
  }, [fontSize]);

  // Socket Event Listeners
  useEffect(() => {
    const onStatus = (status: string) => {
      if (status === 'connected') {
        // When connected, ensure we know WHICH profile is connected.
        // Usually it's the pending one, or we assume it's the one we initiated connection for.
        // We set connectedProfileId in handleConnect/triggerConnection.
        setConnectionStatus(ConnectionStatus.Connected);
        setShowPrompts(true);
      } else if (status === 'disconnected') {
        // If we are currently "Connecting", this disconnect event is likely the cleanup of the previous session.
        // In this case, we should NOT reset the connectedProfileId (which holds the target profile ID).
        // However, we rely on state in the closure. Since `connectionStatus` is in the dependency array,
        // this callback is recreated when it changes.
        setConnectionStatus(prev => {
            if (prev === ConnectionStatus.Connecting) {
                // Ignore disconnect during connection attempt (likely previous session cleanup)
                // But we still need to handle real failures?
                // "Real" failure usually comes via 'ssh:error'.
                // If connection fails at socket level, we might get disconnect.
                // But typically we get 'connected' or 'error' then 'disconnected'.
                // If we ignore it, and connection stalls, we are stuck.
                // But server emits 'connected' shortly after.
                return prev;
            }
            return ConnectionStatus.Disconnected;
        });

        // We only reset state if we are NOT switching connections.
        // But we can't easily check 'prev' state here cleanly without functional updates for all.
        // Let's use the functional update pattern for setConnectedProfileId too,
        // OR better: Check current state in a ref or trust the dependency injection.
        // `connectionStatus` is in dependency array. So we have the current value.

        if (connectionStatus !== ConnectionStatus.Connecting) {
            setConnectedProfileId(null);
            setDetectedDistro(null);
            setCommandQueue([]);
            setActiveStepId(null);
            setExecutionState('idle');
            setSuggestedFix(null);
            setShowPrompts(false);
        }
      }
    };

    const onDistro = (distro: string) => {
      setDetectedDistro(distro);
    };

    const onError = (msg: string) => {
      if (msg.includes('Connection')) {
        setConnectionStatus(ConnectionStatus.Error);
      }
      // If we got an error during connection (e.g. invalid PIN), reset connecting state
      if (connectionStatus === ConnectionStatus.Connecting) {
          setConnectionStatus(ConnectionStatus.Error);
          // Optional: clear cached PIN if invalid?
          if (msg.toLowerCase().includes('pin')) {
              setCachedPin(null);
          }
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
  }, [activeProfileId, profiles, backendError, executionState, detectedDistro, connectionStatus]);

  // Removed auto-disconnect useEffect.
  // Selecting a different profile (activeProfileId) should NOT disconnect the current session.

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
       if (runMode === 'single') {
           setExecutionState('idle');
           addLog('info', 'Step completed.');
           return;
       }

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
       // Error or Empty output
       // Note: "Empty output" with exit code 0 is success (above block).
       // "Empty output" with exit code != 0 falls here.

       updateStepStatus(activeStep.id, CommandStatus.Error);
       setExecutionState('error');

       // Trigger Auto-Fix
       setIsThinking(true);

       const profile = getContextProfile();
       if (profile) {
           try {
             // Use the accumulated output 'currentOutput'
             const fix = await generateCommandFix(activeStep.command, currentOutput, detectedDistro || 'Linux');
             setSuggestedFix(fix);
           } catch (e: any) {
             if (e.message === 'INVALID_API_KEY') {
                 setShowApiKeyModal(true);
             } else {
                 console.error('Failed to generate fix suggestion', e);
             }
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
    // Determine if we need PIN to save.
    // If we have cachedPin, use it.
    // If not, we might need to ask?
    // Ideally, when user adds/edits profile, we should ask for PIN then if not cached.
    // But ConnectionManager is handling the UI.
    // Let's assume for this MVP, if they don't have a cached PIN, we can't save encrypted data properly *if* we need to re-encrypt.
    // Actually, backend requires PIN to encrypt new keys.
    // If we are just deleting, maybe we don't need PIN? But backend endpoint checks for it.

    // We need to trigger PIN modal if no cached PIN.
    // But this function is called from child component.
    // We'll wrap the logic.
  };

  // Refactored Profile Handling with PIN Support
  const handleProfileUpdate = async (updatedProfiles: SSHProfile[]) => {
      if (cachedPin) {
          await performSave(updatedProfiles, cachedPin);
      } else {
          // Trigger PIN entry, then save
          // We need to store the intended action
          // Ideally we would pass a callback to the modal, but using state is easier for now.
          // BUT, `updatedProfiles` is transient.
          // Let's just prompt user in the UI before calling this?
          // No, let's show modal here.
          // For simplicity in this turn, we'll just fail if not logged in?
          // No, requirement is to prompt.
          // Let's use a temporary promise mechanism or just state.
          // Since we can't await the modal easily in this flow without bigger refactor,
          // let's force the user to "Connect" (unlock) before editing?
          // Or just show the modal and retry inside the modal's success handler?
          // Let's go with: Show modal, and pass the data to be saved to the modal or a pending state.
          // Simpler: Just set a "pendingSave" state.
          setPendingSaveProfiles(updatedProfiles);
          setShowPinEntryModal(true);
      }
  };

  const [pendingSaveProfiles, setPendingSaveProfiles] = useState<SSHProfile[] | null>(null);

  const performSave = async (profilesToSave: SSHProfile[], pin: string) => {
      try {
        const res = await fetch(`${API_URL}/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profiles: profilesToSave, pin })
        });
        if (!res.ok) throw new Error("Failed to save");
        setProfiles(profilesToSave);
        setBackendError(null);
        setPendingSaveProfiles(null);
      } catch (err) {
        console.error("Failed to save profiles:", err);
        setBackendError("Failed to save profiles.");
      }
  };

  const handleSaveProfile = (profile: SSHProfile) => {
    const exists = profiles.some(p => p.id === profile.id);
    let updated;
    if (exists) {
        updated = profiles.map(p => p.id === profile.id ? profile : p);
    } else {
        updated = [...profiles, profile];
    }
    handleProfileUpdate(updated);
    if (!activeProfileId) setActiveProfileId(profile.id);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter(p => p.id !== id);
    handleProfileUpdate(updated);
    if (activeProfileId === id) setActiveProfileId(null);
  };

  // Returns the profile that provides context for the main area (Header, Input, AI)
  // If connected, it's the connected profile. Otherwise, it's the selected (active) profile.
  const getContextProfile = () => {
      if (connectionStatus === ConnectionStatus.Connected && connectedProfileId) {
          return profiles.find(p => p.id === connectedProfileId);
      }
      return profiles.find(p => p.id === activeProfileId);
  };

  // Helper to get the profile currently selected in sidebar (for Connect action)
  const getSelectedProfile = () => profiles.find(p => p.id === activeProfileId);

  const getActiveProfile = () => profiles.find(p => p.id === activeProfileId);

  const handleConnect = () => {
    const profile = getSelectedProfile();
    if (!profile) return;

    // Check for cached PIN
    if (!cachedPin) {
        setPendingConnectProfileId(profile.id);
        setShowPinEntryModal(true);
        return;
    }

    triggerConnection(profile.id, cachedPin);
  };

  const triggerConnection = (profileId: string, pin: string) => {
      // If we are already connected to another profile, this new connection request
      // will implicitly disconnect the old one on the backend.
      // Frontend state needs to update to reflect we are connecting to NEW profile.
      setConnectionStatus(ConnectionStatus.Connecting);
      setConnectedProfileId(profileId); // Set intent to connect to this profile
      socket.emit('ssh:connect', {
          profileId,
          pin
      });
  };

  const handlePinSetupSuccess = () => {
      setShowSetupModal(false);
      setIsPinSetup(true);
      // Reload profiles to ensure we have the encrypted versions (though frontend just sees masks)
      loadProfiles();
  };

  const handlePinEntrySuccess = (pin: string) => {
      setCachedPin(pin);
      setShowPinEntryModal(false);

      // Handle pending actions
      if (pendingConnectProfileId) {
          triggerConnection(pendingConnectProfileId, pin);
          setPendingConnectProfileId(null);
      } else if (pendingSaveProfiles) {
          performSave(pendingSaveProfiles, pin);
      }
  };

  const handleDisconnect = () => {
    socket.emit('ssh:disconnect');
    setConnectionStatus(ConnectionStatus.Disconnected);
    setConnectedProfileId(null);
    setCommandQueue([]);
    setExecutionState('idle');
    setDetectedDistro(null);
    setInput('');
  };

  // Handles ENTER key in the main input
  const handleInputSubmit = async () => {
    if (!input.trim()) return;

    // Context for AI commands comes from the CONNECTED profile if connected
    const profile = getContextProfile();
    if (!profile) return;
    
    if (connectionStatus !== ConnectionStatus.Connected) return;

    setIsThinking(true);
    setCommandQueue([]);
    setSuggestedFix(null);
    setShowPrompts(false);

    try {
      const result = await generateLinuxCommand(input, detectedDistro || 'Linux');
      setCommandQueue(result.steps);
    } catch (error: any) {
      if (error.message === 'INVALID_API_KEY') {
          setShowApiKeyModal(true);
      } else {
          console.error('Command generation failed', error);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const applyFix = () => {
    if (!suggestedFix || !activeStepId) return;
    
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
    setExecutionState('idle');
  };

  const skipStep = () => {
      if (!activeStepId) return;
      updateStepStatus(activeStepId, CommandStatus.Skipped);
      setSuggestedFix(null);
      setExecutionState('idle');
  };

  const activeProfile = getContextProfile(); // For Header display
  const isConnected = connectionStatus === ConnectionStatus.Connected;

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans selection:bg-blue-500/30">

      {/* Auth Modals */}
      {showApiKeyModal && (
          <ApiKeyModal onClose={() => setShowApiKeyModal(false)} />
      )}
      {showSetupModal && (
          <SetupPinModal onSuccess={handlePinSetupSuccess} />
      )}
      {showPinEntryModal && (
          <PinEntryModal
              onSuccess={handlePinEntrySuccess}
              onCancel={() => {
                  setShowPinEntryModal(false);
                  setPendingConnectProfileId(null);
                  setPendingSaveProfiles(null);
              }}
            />
      )}

      {/* Sidebar */}
      <ConnectionManager 
        profiles={profiles}
        activeProfileId={activeProfileId}
        connectedProfileId={connectedProfileId}
        connectionStatus={connectionStatus}
        onSelectProfile={setActiveProfileId}
        onSaveProfile={handleSaveProfile}
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
                AIS-Terminal
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
                        <Sparkles size={18} className="text-blue-500" />
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
                    disabled={!isConnected || !!backendError}
                    className="w-full text-sm rounded-lg pl-10 pr-12 py-3 outline-none shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-800/50 bg-gray-800 border border-gray-700 text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
                    placeholder={
                        !!backendError
                            ? "Backend server disconnected"
                            : !activeProfile
                                ? "Select a profile to start..."
                                : !isConnected
                                      ? "Connect to server to run commands..."
                                      : "Describe a task for AI to get a list of commands"
                    }
                  />

                  <button
                    onClick={handleInputSubmit}
                    disabled={!input.trim() || isThinking || !isConnected || !!backendError}
                    className="absolute inset-y-1 right-1 p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white hover:bg-gray-700"
                  >
                    <Send size={18} />
                  </button>
                </div>

                {/* Execution Controls (Only show if queue active) */}
                {(commandQueue.length > 0 && !suggestedFix) && (
                    <div className="flex-shrink-0 flex items-center gap-2">
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
                    </div>
                )}

            </div>

            {/* Fix Suggestion Modal */}
            {suggestedFix && (
              <SuggestionModal
                suggestion={suggestedFix}
                fontSize={fontSize}
                onApply={applyFix}
                onSkip={skipStep}
                onAbort={handleAbort}
              />
            )}

            {/* Quick Prompts */}
            {!input && commandQueue.length === 0 && isConnected && !backendError && showPrompts && (
              <div className="flex gap-2 justify-center mt-2 overflow-x-auto no-scrollbar whitespace-nowrap mask-linear-fade">
                {SAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-full border border-gray-700 transition-colors flex-shrink-0"
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

export default TerminalApp;
