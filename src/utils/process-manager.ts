/**
 * Abstract interface for process managers (PM2, systemd, etc.)
 */
export interface ProcessManager {
  /** Name of the process manager */
  readonly name: string;
  
  /** Restart a process by name */
  restart(processName: string, options?: ProcessManagerOptions): void;
  
  /** Get status/list of processes */
  list(options?: ProcessManagerOptions): string;
  
  /** Save current process state (for resurrection after reboot) */
  save(options?: ProcessManagerOptions): void;
  
  /** Get info about a specific process */
  show(processName: string, options?: ProcessManagerOptions): string;
  
  /** Check if a process exists */
  exists(processName: string, options?: ProcessManagerOptions): boolean;
  
  /** Run command as specific user (for server-side) */
  asUser(user: string, command: string, options?: ProcessManagerOptions): void;
}

/**
 * Options for process manager commands
 */
export interface ProcessManagerOptions {
  /** Home directory for the process manager */
  home?: string;
  
  /** Run silently (no output) */
  silent?: boolean;
}

/**
 * Process manager types
 */
export type ProcessManagerType = 'pm2' | 'systemd';

/**
 * Factory function to create a process manager instance
 */
export function createProcessManager(type: ProcessManagerType): ProcessManager {
  switch (type) {
    case 'pm2':
      // Lazy import to avoid loading unused modules
      const { PM2ProcessManager } = require('./pm2.js');
      return new PM2ProcessManager();
    case 'systemd':
      const { SystemdProcessManager } = require('./systemd.js');
      return new SystemdProcessManager();
    default:
      throw new Error(`Unknown process manager type: ${type}`);
  }
}
