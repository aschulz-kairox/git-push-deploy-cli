import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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

/**
 * Find SSH public key file
 * Returns path to first found key, or null if none exists
 */
export function findSshPublicKey(): string | null {
  const home = homedir();
  const keyFiles = [
    join(home, '.ssh', 'id_ed25519.pub'),
    join(home, '.ssh', 'id_rsa.pub'),
    join(home, '.ssh', 'id_ecdsa.pub'),
  ];
  
  for (const keyFile of keyFiles) {
    if (existsSync(keyFile)) {
      return keyFile;
    }
  }
  return null;
}

/**
 * Read SSH public key content
 */
export function readSshPublicKey(keyPath: string): string {
  return readFileSync(keyPath, 'utf-8').trim();
}

/**
 * Check if SSH connection works without password (key-based auth)
 * Returns true if connection succeeds, false otherwise
 */
export function checkSshConnection(host: string, sshOptions?: string): boolean {
  try {
    const sshOpts = sshOptions ? `${sshOptions} ` : '';
    // Use BatchMode to fail immediately if password is needed
    // Use ConnectTimeout to not wait too long
    execSync(
      `ssh ${sshOpts}-o BatchMode=yes -o ConnectTimeout=5 ${host} "echo ok"`,
      { stdio: 'pipe', timeout: 10000 }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy SSH public key to remote host
 * Uses ssh-copy-id on Unix, manual append on Windows
 */
export function copySshKey(host: string, keyPath: string, sshOptions?: string): void {
  const sshOpts = sshOptions ? `${sshOptions} ` : '';
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Windows: manually append key to authorized_keys
    const pubKey = readSshPublicKey(keyPath);
    const escapedKey = pubKey.replace(/"/g, '\\"');
    const cmd = `ssh ${sshOpts}${host} "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo \\"${escapedKey}\\" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"`;
    execSync(cmd, { stdio: 'inherit' });
  } else {
    // Unix: use ssh-copy-id
    execSync(`ssh-copy-id ${sshOpts}-i ${keyPath} ${host}`, { stdio: 'inherit' });
  }
}
