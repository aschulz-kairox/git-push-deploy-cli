import chalk from 'chalk';
import { spawn } from 'child_process';
import { getServiceConfig } from '../config/loader.js';
import { exec } from '../utils/shell.js';
import { exists } from '../utils/files.js';

interface LogsOptions {
  lines?: string;
  follow?: boolean;
}

/**
 * Logs command - show deployment logs
 */
export async function logsCommand(serviceName: string, options: LogsOptions = {}): Promise<void> {
  const lines = options.lines || '50';
  const logFile = `/var/log/deploy-${serviceName}.log`;
  
  // Check if log file exists
  if (!exists(logFile)) {
    // Try to get config to show better error message
    try {
      getServiceConfig(serviceName);
      console.log(chalk.yellow(`Log file not found: ${logFile}`));
      console.log(chalk.gray('The service may not have been deployed yet.'));
    } catch {
      console.log(chalk.red(`Unknown service: ${serviceName}`));
    }
    return;
  }
  
  if (options.follow) {
    console.log(chalk.blue(`Following logs for ${serviceName} (Ctrl+C to exit)...`));
    console.log('');
    
    // Use spawn for follow mode
    const tail = spawn('tail', ['-f', '-n', lines, logFile], {
      stdio: 'inherit'
    });
    
    tail.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  } else {
    console.log(chalk.blue(`Deployment logs for ${serviceName} (last ${lines} lines):`));
    console.log('');
    
    exec(`tail -n ${lines} ${logFile}`);
  }
}
