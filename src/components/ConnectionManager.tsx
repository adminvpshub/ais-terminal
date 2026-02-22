import React, { useState, useEffect } from 'react';
import { SSHProfile, LinuxDistro, ConnectionStatus } from '../types';
import { Button } from './Button';
import { Server, Plus, Trash2, Download, Save, Eye, EyeOff, Plug, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react';

interface ConnectionManagerProps {
  profiles: SSHProfile[];
  activeProfileId: string | null;
  connectedProfileId: string | null;
  connectionStatus: ConnectionStatus;
  onSelectProfile: (id: string) => void;
  onSaveProfile: (profile: SSHProfile) => void;
  onDeleteProfile: (id: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  profiles,
  activeProfileId,
  connectedProfileId,
  connectionStatus,
  onSelectProfile,
  onSaveProfile,
  onDeleteProfile,
  onConnect,
  onDisconnect
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (connectionStatus === ConnectionStatus.Connected) {
      setIsCollapsed(true);
    }
  }, [connectionStatus]);
  
  // Form State
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [connectionType, setConnectionType] = useState<'direct' | 'cloudflared'>('direct');
  const [cloudflaredClientId, setCloudflaredClientId] = useState('');
  const [cloudflaredClientSecret, setCloudflaredClientSecret] = useState('');

  // Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setName('');
    setHost('');
    setUsername('');
    setPrivateKey('');
    setPassphrase('');
    setConnectionType('direct');
    setCloudflaredClientId('');
    setCloudflaredClientSecret('');
    setEditingId(null);
    setIsEditing(false);
    setErrors({});
  };

  const handleEdit = (profile: SSHProfile) => {
    setEditingId(profile.id);
    setName(profile.name);
    setHost(profile.host);
    setUsername(profile.username);
    setPrivateKey(''); // Always clear key field for security/simplicity. Empty = keep existing.
    setPassphrase(''); // Clear passphrase field. Empty = keep existing.
    setConnectionType(profile.connectionType || 'direct');
    setCloudflaredClientId(profile.cloudflaredClientId || '');
    setCloudflaredClientSecret(profile.cloudflaredClientSecret || '');
    setIsEditing(true);
    setErrors({});
  };

  const validate = () => {
      const newErrors: Record<string, string> = {};

      // Name Validation
      // Allow alphanumeric, spaces, hyphens, underscores, dots
      const nameRegex = /^[a-zA-Z0-9_\-\. ]+$/;

      const nameVal = name.trim();
      if (nameVal === undefined || name === null) {
          // Note: controlled inputs are rarely null/undefined, but keeping logic consistent
          newErrors.name = "Profile Name is required";
      } else if (!nameRegex.test(nameVal)) {
          // Empty string fails regex -> "Invalid format" as requested
          newErrors.name = "Invalid Profile Name format";
      }

      // Host Validation
      // IPv4
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      // Simple IPv6 check (contains : and hex)
      const isIPv6 = (val: string) => val.includes(':') && /^[0-9a-fA-F:]+$/.test(val);
      // Hostname (RFC 1123 mostly)
      const hostnameRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

      const hostVal = host.trim();
      if (hostVal === undefined || host === null) {
          newErrors.host = "Host/IP is required";
      } else {
          const isValid = ipv4Regex.test(hostVal) || isIPv6(hostVal) || hostnameRegex.test(hostVal);
          if (!isValid) {
              newErrors.host = "Invalid Host/IP or Hostname format";
          }
      }

      // User Validation
      // Standard linux username: start with letter/_, then alphanumeric/-_
      // But we can be lenient: just ensure it's not empty via regex check
      const userRegex = /^[a-z_][a-z0-9_\-]*$/i;

      const userVal = username.trim();
      if (userVal === undefined || username === null) {
          newErrors.username = "User is required";
      } else if (!userRegex.test(userVal)) {
          newErrors.username = "Invalid User format";
      }

      // Key Validation
      if (!editingId) {
          // New Profile: Required + Format
          if (!privateKey.trim()) {
              newErrors.privateKey = "SSH Private Key is required";
          } else if (!privateKey.trim().startsWith('-----BEGIN')) {
              newErrors.privateKey = "Key must start with -----BEGIN";
          }
      } else {
          // Edit Profile: Optional (empty = keep), Format if filled
          if (privateKey.trim() && !privateKey.trim().startsWith('-----BEGIN')) {
              newErrors.privateKey = "Key must start with -----BEGIN";
          }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    
    const profileData: SSHProfile = {
      id: editingId || crypto.randomUUID(),
      name,
      host,
      username,
      privateKey, // If empty string, backend logic preserves existing key
      passphrase: passphrase || undefined, // If empty/undefined, backend preserves existing
      connectionType,
      cloudflaredClientId: connectionType === 'cloudflared' ? cloudflaredClientId : undefined,
      cloudflaredClientSecret: connectionType === 'cloudflared' ? cloudflaredClientSecret : undefined,
    };
    
    onSaveProfile(profileData);
    resetForm();
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profiles, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "ssh_profiles.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const isConnected = connectionStatus === ConnectionStatus.Connected;
  const isConnecting = connectionStatus === ConnectionStatus.Connecting;

  return (
    <div className={`flex flex-col h-full bg-gray-800 border-r border-gray-700 flex-shrink-0 transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-80'}`}>
      <div className={`p-4 border-b border-gray-700 flex items-center bg-gray-900/50 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed && (
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Server size={18} /> Connections
          </h2>
        )}

        <div className="flex gap-1 items-center">
          {!isCollapsed && (
            <>
              <button
                onClick={handleExport}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Export Profiles"
              >
                <Download size={16} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                title="Add New Connection"
              >
                <Plus size={16} />
              </button>
            </>
          )}

          <button
             onClick={() => setIsCollapsed(!isCollapsed)}
             className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
             title={isCollapsed ? "Expand" : "Collapse"}
          >
             {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {!isCollapsed && isEditing && (
          <div className="bg-gray-700/50 p-3 rounded-md border border-gray-600 space-y-3 animate-in fade-in slide-in-from-top-2 shadow-lg relative z-10">
             <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Profile Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors(prev => ({...prev, name: ''}));
                }}
                className={`w-full bg-gray-900 border ${errors.name ? 'border-red-500' : 'border-gray-600'} rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none`}
                placeholder="Prod Server"
              />
              {errors.name && <span className="text-red-500 text-xs mt-1 block">{errors.name}</span>}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Connection Type</label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connectionType"
                    checked={connectionType === 'direct'}
                    onChange={() => setConnectionType('direct')}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-gray-300">Direct SSH (Static IP)</span>
                </label>
                {/* Cloudflared option disabled temporarily
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connectionType"
                    checked={connectionType === 'cloudflared'}
                    onChange={() => setConnectionType('cloudflared')}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-gray-300">Cloudflare Tunnel</span>
                </label>
                */}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {connectionType === 'cloudflared' ? 'Hostname' : 'Host/IP'}
                </label>
                <input 
                    type="text" 
                    value={host} 
                    onChange={(e) => {
                        setHost(e.target.value);
                        if (errors.host) setErrors(prev => ({...prev, host: ''}));
                    }}
                    className={`w-full bg-gray-900 border ${errors.host ? 'border-red-500' : 'border-gray-600'} rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none`}
                    placeholder={connectionType === 'cloudflared' ? "tunnel.example.com" : "192.168.1.1"}
                />
                {errors.host && <span className="text-red-500 text-xs mt-1 block">{errors.host}</span>}
                </div>
                <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">User</label>
                <input 
                    type="text" 
                    value={username} 
                    onChange={(e) => {
                        setUsername(e.target.value);
                        if (errors.username) setErrors(prev => ({...prev, username: ''}));
                    }}
                    className={`w-full bg-gray-900 border ${errors.username ? 'border-red-500' : 'border-gray-600'} rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none`}
                />
                {errors.username && <span className="text-red-500 text-xs mt-1 block">{errors.username}</span>}
                </div>
            </div>

            {connectionType === 'cloudflared' && (
              <div className="bg-blue-900/10 p-2 rounded border border-blue-900/30 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Service Token Client ID (Optional)</label>
                  <input
                    type="text"
                    value={cloudflaredClientId}
                    onChange={(e) => setCloudflaredClientId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="access-client-id"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Service Token Client Secret (Optional)</label>
                  <input
                    type="password"
                    value={cloudflaredClientSecret}
                    onChange={(e) => setCloudflaredClientSecret(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="access-client-secret"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium text-gray-400">SSH Private Key</label>
                <button onClick={() => setShowKey(!showKey)} className="text-gray-500 hover:text-gray-300">
                    {showKey ? <EyeOff size={12}/> : <Eye size={12}/>}
                </button>
              </div>
              <textarea 
                value={privateKey} 
                onChange={(e) => {
                    setPrivateKey(e.target.value);
                    if (errors.privateKey) setErrors(prev => ({...prev, privateKey: ''}));
                }}
                className={`w-full bg-gray-900 border ${errors.privateKey ? 'border-red-500' : 'border-gray-600'} rounded px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-blue-500 outline-none font-mono ${showKey ? '' : 'text-security-disc'}`}
                placeholder={editingId ? "Leave blank to keep existing key" : "-----BEGIN OPENSSH PRIVATE KEY-----"}
                rows={3}
                style={!showKey ? { WebkitTextSecurity: 'disc' } as any : {}}
              />
              {errors.privateKey && <span className="text-red-500 text-xs mt-1 block">{errors.privateKey}</span>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Passphrase (Optional)</label>
              <input 
                type="password" 
                value={passphrase} 
                onChange={(e) => setPassphrase(e.target.value)} 
                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder={editingId ? "Leave blank to keep existing" : "Key Passphrase"}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={resetForm} className="flex-1">Cancel</Button>
              <Button size="sm" onClick={handleSave} className="flex-1 gap-1"><Save size={14}/> Save</Button>
            </div>
          </div>
        )}

        {profiles.map(profile => {
          const isActive = activeProfileId === profile.id;
          const isConnectedProfile = connectedProfileId === profile.id;

          if (isCollapsed) {
              return (
                <div
                    key={profile.id}
                    onClick={() => onSelectProfile(profile.id)}
                    title={`${profile.name} (${profile.username}@${profile.host})`}
                    className={`
                        w-10 h-10 mx-auto rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 relative
                        ${isActive
                            ? 'bg-blue-900/30 text-blue-400 ring-1 ring-blue-500/50'
                            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}
                    `}
                >
                    <Server size={20} />
                    {isConnectedProfile && isConnected && (
                        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-800 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
                    )}
                </div>
              );
          }

          return (
            <div 
              key={profile.id}
              onClick={() => onSelectProfile(profile.id)}
              className={`
                group p-3 rounded-md cursor-pointer border transition-all duration-200 relative
                ${isActive 
                  ? 'bg-blue-900/20 border-blue-500/50 shadow-md ring-1 ring-blue-500/20' 
                  : 'bg-gray-800 border-transparent hover:bg-gray-700/50 hover:border-gray-600'}
              `}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`font-medium truncate ${isActive ? 'text-blue-400' : 'text-gray-200'}`}>
                      {profile.name}
                    </div>
                    {isConnectedProfile && isConnected && (
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                    {profile.username}@{profile.host}
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(profile); }}
                        className="p-1.5 text-gray-500 hover:text-blue-400"
                        title="Edit Connection"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteProfile(profile.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400"
                        title="Delete Connection"
                    >
                        <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
              
              {isActive && (
                <div className="mt-3 pt-2 border-t border-gray-700/50 flex gap-2">
                   {isConnected && isConnectedProfile ? (
                     <Button 
                       size="sm" 
                       variant="danger" 
                       className="w-full py-1 h-8 text-xs"
                       onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
                     >
                       Disconnect
                     </Button>
                   ) : (
                    <Button 
                      size="sm" 
                      variant="primary" 
                      className="w-full py-1 h-8 text-xs"
                      isLoading={isConnecting}
                      onClick={(e) => { e.stopPropagation(); onConnect(); }}
                    >
                      <Plug size={12} className="mr-1.5"/> Connect
                    </Button>
                   )}
                </div>
              )}
            </div>
          );
        })}
        
        {profiles.length === 0 && !isEditing && (
            <div className="text-center text-gray-500 text-sm py-8 px-4">
                {isCollapsed ? (
                    <span title="No profiles" className="text-gray-600">-</span>
                ) : (
                    <>No profiles.<br/>Click "+" to add one.</>
                )}
            </div>
        )}
      </div>
    </div>
  );
};