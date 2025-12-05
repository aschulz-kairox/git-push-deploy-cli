import chalk from 'chalk';
import { spawn } from 'child_process';
import { getServiceConfig } from '../config/loader.js';
import { getPrimaryServer } from '../config/types.js';

interface LogsOptions {
  lines?: string;
  follow?: boolean;
}

/**
 * Logs command - show PM2 logs from server via SSH
 * Note: For multi-server, shows logs from primary server only
 */
export async function logsCommand(serviceName: string, options: LogsOptions = {}): Promise<void> {
  const config = getServiceConfig(serviceName);
  const primaryServer = getPrimaryServer(config);
  const { host, sshOptions } = primaryServer;
  const { processName, pm2Home } = config;
  const lines = options.lines || '50';
  
  const pm2Env = pm2Home ? `PM2_HOME=${pm2Home}` : '';
  
  console.log(chalk.blue(`Logs for ${serviceName} from ${host}...`));
  console.log('');
  
  // Build SSH args with options
  const sshBaseArgs = sshOptions ? sshOptions.split(' ') : [];
  
  if (options.follow) {
    // Use spawn for follow mode with SSH
    const sshArgs = [...sshBaseArgs, host, `${pm2Env} pm2 logs ${processName} --lines ${lines}`];
    const ssh = spawn('ssh', sshArgs, {
      stdio: 'inherit'
    });
    
    ssh.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  } else {
    // Non-follow mode: get last N lines
    const sshArgs = [...sshBaseArgs, host, `${pm2Env} pm2 logs ${processName} --lines ${lines} --nostream`];
    const ssh = spawn('ssh', sshArgs, {
      stdio: 'inherit'
    });
    
    ssh.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  }
}
