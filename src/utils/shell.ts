import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import chalk from 'chalk';

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
 * Check SSH key file permissions (Unix only)
 * SSH requires private keys to have 600 permissions (owner read/write only)
 * Warns if permissions are too open, which is a security risk
 * 
 * @param keyPath Path to public key (.pub) - will check the private key
 */
export function checkSshKeyPermissions(keyPath: string): void {
  // Skip on Windows - permissions work differently
  if (platform() === 'win32') {
    return;
  }
  
  // Check private key (remove .pub extension)
  const privateKeyPath = keyPath.replace(/\.pub$/, '');
  
  if (!existsSync(privateKeyPath)) {
    return;
  }
  
  try {
    const stats = statSync(privateKeyPath);
    const mode = stats.mode & 0o777; // Get permission bits
    
    // Check if permissions are too open (should be 600 or 400)
    if (mode & 0o077) { // Any group or other permissions
      const octal = mode.toString(8).padStart(3, '0');
      console.log(chalk.yellow(`\n⚠ Security warning: SSH private key has insecure permissions`));
      console.log(chalk.yellow(`  File: ${privateKeyPath}`));
      console.log(chalk.yellow(`  Current: ${octal} (should be 600 or 400)`));
      console.log(chalk.gray(`  Fix with: chmod 600 ${privateKeyPath}`));
      console.log();
    }
  } catch {
    // Ignore errors (e.g., can't stat file)
  }
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

/**
 * Run SSH command and return output as Promise
 */
export async function runSshCommand(host: string, command: string, sshOptions?: string): Promise<string> {
  const sshOpts = sshOptions ? `${sshOptions} ` : '';
  const escapedCmd = command.replace(/"/g, '\\"');
  const sshCommand = `ssh ${sshOpts}${host} "${escapedCmd}"`;
  
  try {
    const output = execSync(sshCommand, { encoding: 'utf-8' });
    return output.trim();
  } catch (error: any) {
    if (error.stdout) {
      return error.stdout.toString().trim();
    }
    throw new Error(`SSH command failed: ${error.message}`);
  }
}

/**
 * Copy a local file to a remote host via SCP
 */
export function scpFile(localPath: string, host: string, remotePath: string, sshOptions?: string): void {
  // Extract port from sshOptions if present (e.g., "-p 6771")
  let scpOpts = '';
  if (sshOptions) {
    const portMatch = sshOptions.match(/-p\s*(\d+)/);
    if (portMatch) {
      scpOpts = `-P ${portMatch[1]} `;
    }
    // Also add other options like -4 for IPv4
    const ipv4Match = sshOptions.match(/-4/);
    if (ipv4Match) {
      scpOpts += '-4 ';
    }
  }
  
  const scpCommand = `scp ${scpOpts}"${localPath}" ${host}:"${remotePath}"`;
  execSync(scpCommand, { stdio: 'inherit' });
}
