import type { ProcessManager, ProcessManagerOptions } from './process-manager.js';
import { exec, execOutput } from './shell.js';

/**
 * Systemd Process Manager implementation
 * 
 * Uses systemctl to manage services. The processName is expected to be 
 * a systemd service name (e.g., "myapp.service" or just "myapp").
 */
export class SystemdProcessManager implements ProcessManager {
  readonly name = 'systemd';
  
  private serviceName(name: string): string {
    return name.endsWith('.service') ? name : `${name}.service`;
  }
  
  restart(processName: string, options?: ProcessManagerOptions): void {
    const service = this.serviceName(processName);
    exec(`sudo systemctl restart ${service}`, { silent: options?.silent });
  }
  
  list(options?: ProcessManagerOptions): string {
    // List all running services
    return execOutput('systemctl list-units --type=service --state=running --no-pager');
  }
  
  save(options?: ProcessManagerOptions): void {
    // systemd auto-saves, but we can enable the service for boot
    // This is a no-op for systemd as it manages state automatically
    console.log('Note: systemd manages service state automatically.');
  }
  
  show(processName: string, options?: ProcessManagerOptions): string {
    const service = this.serviceName(processName);
    return execOutput(`systemctl status ${service} --no-pager`);
  }
  
  exists(processName: string, options?: ProcessManagerOptions): boolean {
    const service = this.serviceName(processName);
    try {
      execOutput(`systemctl cat ${service} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }
  
  asUser(user: string, command: string, options?: ProcessManagerOptions): void {
    // For systemd, we use systemctl directly (no user switching needed)
    // The 'command' here should be a systemctl action like 'restart myapp'
    exec(`sudo systemctl ${command}`, { silent: options?.silent });
  }
  
  /**
   * Enable service to start on boot
   */
  enable(processName: string): void {
    const service = this.serviceName(processName);
    exec(`sudo systemctl enable ${service}`, { silent: true });
  }
  
  /**
   * Disable service from starting on boot
   */
  disable(processName: string): void {
    const service = this.serviceName(processName);
    exec(`sudo systemctl disable ${service}`, { silent: true });
  }
  
  /**
   * Reload systemd daemon (after changing unit files)
   */
  daemonReload(): void {
    exec('sudo systemctl daemon-reload', { silent: true });
  }
  
  /**
   * Check if service is active
   */
  isActive(processName: string): boolean {
    const service = this.serviceName(processName);
    try {
      const result = execOutput(`systemctl is-active ${service}`);
      return result.trim() === 'active';
    } catch {
      return false;
    }
  }
}
