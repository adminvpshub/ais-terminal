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
  privateKey: string;
  passphrase?: string;
  // distro field is removed as it is now auto-detected
}

export interface TerminalEntry {
  id: string;
  type: 'command' | 'output' | 'error' | 'info';
  content: string;
  timestamp: number;
}

export interface CommandGenerationResult {
  command: string;
  explanation: string;
  dangerous: boolean;
}
