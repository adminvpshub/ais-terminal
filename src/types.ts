export type LinuxDistro = string;

export enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export interface SSHProfile {
  id: string;
  name: string;
  host: string;
  username: string;
  privateKey: string | boolean; // boolean if masked from backend
  passphrase?: string | boolean;
  // distro field is removed as it is now auto-detected
}

export interface TerminalEntry {
  id: string;
  type: 'command' | 'output' | 'error' | 'info';
  content: string;
  timestamp: number;
}

export enum CommandStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Error = 'error',
  Skipped = 'skipped',
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

export type FixType = 'error' | 'suggestion';

export interface CommandFix extends CommandStep {
  classification: FixType;
}
