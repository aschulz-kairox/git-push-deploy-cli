import type { ProcessManager, ProcessManagerOptions } from './process-manager.js';
import { exec, execOutput } from './shell.js';

/**
 * PM2 Process Manager implementation
 */
export class PM2ProcessManager implements ProcessManager {
  readonly name = 'pm2';
  
  private buildEnv(options?: ProcessManagerOptions): string {
    return options?.home ? `PM2_HOME=${options.home} ` : '';
  }
  
  restart(processName: string, options?: ProcessManagerOptions): void {
    const env = this.buildEnv(options);
    exec(`${env}pm2 restart ${processName} --no-color`, { silent: options?.silent });
  }
  
  list(options?: ProcessManagerOptions): string {
    const env = this.buildEnv(options);
    return execOutput(`${env}pm2 list --no-color`);
  }
  
  save(options?: ProcessManagerOptions): void {
    const env = this.buildEnv(options);
    exec(`${env}pm2 save`, { silent: true });
  }
  
  show(processName: string, options?: ProcessManagerOptions): string {
    const env = this.buildEnv(options);
    return execOutput(`${env}pm2 show ${processName} --no-color`);
  }
  
  exists(processName: string, options?: ProcessManagerOptions): boolean {
    try {
      this.show(processName, options);
      return true;
    } catch {
      return false;
    }
  }
  
  asUser(user: string, command: string, options?: ProcessManagerOptions): void {
    const env = this.buildEnv(options);
    exec(`sudo -u ${user} ${env}pm2 ${command} --no-color`, { silent: options?.silent });
  }
}

// Legacy function exports for backward compatibility

/**
 * Restart PM2 process
 */
export function pm2Restart(processName: string, pm2Home?: string): void {
  const pm2 = new PM2ProcessManager();
  pm2.restart(processName, { home: pm2Home });
}

/**
 * Get PM2 process list
 */
export function pm2List(pm2Home?: string): string {
  const pm2 = new PM2ProcessManager();
  return pm2.list({ home: pm2Home });
}

/**
 * Save PM2 process list
 */
export function pm2Save(pm2Home?: string): void {
  const pm2 = new PM2ProcessManager();
  pm2.save({ home: pm2Home });
}

/**
 * Get PM2 process info
 */
export function pm2Show(processName: string, pm2Home?: string): string {
  const pm2 = new PM2ProcessManager();
  return pm2.show(processName, { home: pm2Home });
}

/**
 * Check if PM2 process exists
 */
export function pm2ProcessExists(processName: string, pm2Home?: string): boolean {
  const pm2 = new PM2ProcessManager();
  return pm2.exists(processName, { home: pm2Home });
}

/**
 * Run PM2 command as specific user (for server-side)
 */
export function pm2AsUser(user: string, command: string, pm2Home?: string): void {
  const pm2 = new PM2ProcessManager();
  pm2.asUser(user, command, { home: pm2Home });
}
