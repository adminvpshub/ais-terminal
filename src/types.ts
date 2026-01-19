
export interface SSHProfile {
  id: string;
  name: string;
  host: string;
  username: string;
  privateKey: string | boolean; // string (encrypted) on server, boolean (masked) on client
  passphrase?: string | boolean;
}

export interface TerminalEntry {
  type: 'command' | 'output' | 'error' | 'info';
  content: string;
  timestamp: number;
}

export enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error'
}

export enum CommandStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Error = 'error',
  Skipped = 'skipped'
}

export interface CommandStep {
  id: string;
  command: string;
  explanation: string;
  dangerous: boolean;
  status: CommandStatus;
}

export interface CommandGenerationResult {
  steps: CommandStep[];
}

export interface CommandFix extends CommandStep {
    originalError: string;
    fixType: 'correction' | 'alternative';
}

export type LinuxDistro = 'Ubuntu' | 'Debian' | 'CentOS' | 'Fedora' | 'Arch' | 'Alpine' | 'Unknown';

export interface RemoteFile {
    name: string;
    type: 'd' | 'f';
    size: number;
    date: string;
    permissions: number;
}

export type TransferType = 'upload' | 'download';

export interface FileTransfer {
    id: string;
    type: TransferType;
    filename: string;
    progress: number; // 0-100
    status: 'pending' | 'running' | 'completed' | 'error';
    error?: string;
    startTime: number;
    totalSize: number;
    transferredSize: number;
}
