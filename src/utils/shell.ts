import { execSync } from 'child_process';

/**
 * Execute a shell command and return output
 */
export function exec(command: string, options: { cwd?: string; silent?: boolean } = {}): string {
  try {
    const result = execSync(command, {
      cwd: options.cwd,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit'
    });
    return result?.trim() || '';
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      return (error as { stdout: string }).stdout?.trim() || '';
    }
    throw error;
  }
}

/**
 * Execute command and return output (always silent)
 */
export function execOutput(command: string, cwd?: string): string {
  return exec(command, { cwd, silent: true });
}

/**
 * Check if a command exists
 */
export function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if running as root
 */
export function isRoot(): boolean {
  return process.getuid?.() === 0;
}

/**
 * Get current username
 */
export function getCurrentUser(): string {
  return process.env.USER || process.env.USERNAME || 'unknown';
}

/**
 * Execute a command on a remote host via SSH
 */
export function sshExec(host: string, command: string, options: { silent?: boolean; sshOptions?: string } = {}): string {
  // For Windows, use double quotes and escape internal quotes
  const escapedCmd = command.replace(/"/g, '\\"');
  const sshOpts = options.sshOptions ? `${options.sshOptions} ` : '';
  const sshCommand = `ssh ${sshOpts}${host} "${escapedCmd}"`;
  return exec(sshCommand, { silent: options.silent });
}
