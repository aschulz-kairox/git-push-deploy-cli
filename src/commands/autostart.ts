import chalk from 'chalk';
import { getServiceConfig, listServices } from '../config/loader.js';
import { getServers } from '../config/types.js';
import { runSshCommand } from '../utils/shell.js';

/**
 * Autostart command - manage systemd units for gpdd services
 * 
 * gpd autostart <service> enable   Create and enable systemd unit
 * gpd autostart <service> disable  Disable and remove systemd unit
 * gpd autostart <service> status   Show autostart status
 * 
 * Batch commands:
 * gpd autostart all enable         Enable all gpdd services
 * gpd autostart all disable        Disable all gpdd services
 * gpd autostart all status         Show status of all services
 */
export async function autostartCommand(serviceName: string, action: string): Promise<void> {
  if (!['enable', 'disable', 'status'].includes(action)) {
    console.error(chalk.red(`Unknown action: ${action}`));
    console.log('Available actions: enable, disable, status');
    return;
  }
  
  // Handle "all" service for batch operations
  if (serviceName === 'all') {
    await handleAllServices(action as 'enable' | 'disable' | 'status');
    return;
  }
  
  await handleSingleService(serviceName, action as 'enable' | 'disable' | 'status');
}

/**
 * Handle autostart command for all gpdd services
 */
async function handleAllServices(action: 'enable' | 'disable' | 'status'): Promise<void> {
  const services = listServices();
  const gpddServices: string[] = [];
  
  for (const name of services) {
    const config = getServiceConfig(name);
    if (config.processManager === 'gpdd') {
      gpddServices.push(name);
    }
  }
  
  if (gpddServices.length === 0) {
    console.log(chalk.yellow('No services configured with processManager: "gpdd"'));
    return;
  }
  
  console.log(chalk.bold(`Running autostart ${action} on ${gpddServices.length} gpdd services...`));
  console.log('');
  
  for (const name of gpddServices) {
    console.log(chalk.blue(`━━━ ${name} ━━━`));
    try {
      await handleSingleService(name, action);
    } catch (error: any) {
      console.error(chalk.red(`  Failed: ${error.message}`));
    }
    console.log('');
  }
}

/**
 * Generate systemd unit content for a gpdd service
 */
function generateSystemdUnit(options: {
  description: string;
  workingDirectory: string;
  envFile: string;
  user: string;
  group: string;
  entryPoint: string;
  workers: number;
  ipcPort: number;
  bindAddress?: string;
  readyUrl?: string;
  healthUrl?: string;
  environment?: string;
  afterServices?: string[];
}): string {
  const after = options.afterServices?.length 
    ? `After=network.target ${options.afterServices.join(' ')}`
    : 'After=network.target';
  
  // Build ExecStart command with all gpdd options
  let execStart = `/usr/bin/gpdd start ${options.entryPoint} --workers ${options.workers} --ipc-port ${options.ipcPort}`;
  
  if (options.bindAddress) {
    execStart += ` --bind ${options.bindAddress}`;
  }
  if (options.readyUrl) {
    execStart += ` --ready-url ${options.readyUrl}`;
  }
  if (options.healthUrl) {
    execStart += ` --health-url ${options.healthUrl}`;
  }
  
  // Build Environment line
  const envLine = options.environment 
    ? `Environment=NODE_ENV=${options.environment}`
    : '';
  
  return `[Unit]
Description=${options.description}
${after}
Wants=network-online.target

[Service]
Type=simple
User=${options.user}
Group=${options.group}
WorkingDirectory=${options.workingDirectory}
EnvironmentFile=${options.envFile}
${envLine}
ExecStart=${execStart}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target`;
}

/**
 * Handle autostart command for a single service
 */
async function handleSingleService(serviceName: string, action: 'enable' | 'disable' | 'status'): Promise<void> {
  const config = getServiceConfig(serviceName);
  const servers = getServers(config);
  
  if (config.processManager !== 'gpdd') {
    console.log(chalk.yellow(`Service ${serviceName} uses ${config.processManager || 'pm2'}, not gpdd`));
    return;
  }
  
  for (const server of servers) {
    const { host, sshOptions, targetDir } = server;
    const serverLabel = server.name || host;
    
    // Extract systemd service name from processName
    const systemdServiceName = config.processName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const unitPath = `/etc/systemd/system/${systemdServiceName}.service`;
    
    console.log(chalk.gray(`  Server: ${serverLabel}`));
    console.log(chalk.gray(`  Service: ${systemdServiceName}`));
    
    switch (action) {
      case 'status':
        await showAutostartStatus(host, sshOptions, systemdServiceName);
        break;
        
      case 'enable':
        await enableAutostart(host, sshOptions, {
          serviceName: systemdServiceName,
          unitPath,
          description: `${serviceName} (gpdd)`,
          workingDirectory: targetDir,
          envFile: `${targetDir}/.env`,
          user: config.pm2User || 'root',
          group: config.pm2User || 'root',
          entryPoint: config.gpddEntryPoint || 'dist/index.js',
          workers: config.gpddWorkers || 2,
          ipcPort: config.gpddIpcPort || getIpcPort(config.processName),
          bindAddress: config.gpddBindAddress,
          readyUrl: config.gpddReadyUrl,
          healthUrl: config.gpddHealthUrl,
          environment: config.environment,
          afterServices: config.gpddAfterServices || [],
        });
        break;
        
      case 'disable':
        await disableAutostart(host, sshOptions, systemdServiceName, unitPath);
        break;
    }
  }
}

/**
 * Calculate IPC port based on service name (consistent hashing)
 * Uses port range 50000-59999 for IPC
 */
function getIpcPort(processName: string): number {
  // Simple hash based on process name
  let hash = 0;
  for (let i = 0; i < processName.length; i++) {
    hash = ((hash << 5) - hash) + processName.charCodeAt(i);
    hash = hash & hash;
  }
  return 50000 + (Math.abs(hash) % 10000);
}

/**
 * Show autostart status for a service
 */
async function showAutostartStatus(host: string, sshOptions: string | undefined, serviceName: string): Promise<void> {
  try {
    const cmd = `systemctl is-enabled ${serviceName} 2>/dev/null || echo 'not-found'`;
    const enabledStatus = await runSshCommand(host, cmd, sshOptions);
    
    const activeCmd = `systemctl is-active ${serviceName} 2>/dev/null || echo 'inactive'`;
    const activeStatus = await runSshCommand(host, activeCmd, sshOptions);
    
    const isEnabled = enabledStatus.trim() === 'enabled';
    const isActive = activeStatus.trim() === 'active';
    const exists = enabledStatus.trim() !== 'not-found';
    
    if (!exists) {
      console.log(`  Autostart: ${chalk.gray('not configured')}`);
    } else if (isEnabled) {
      console.log(`  Autostart: ${chalk.green('enabled')}`);
    } else {
      console.log(`  Autostart: ${chalk.yellow('disabled')}`);
    }
    
    if (exists) {
      console.log(`  Status: ${isActive ? chalk.green('active') : chalk.red('inactive')}`);
      
      // Show configured workers from unit file
      try {
        const grepCmd = `grep -oP '(?<=--workers )\\d+' /etc/systemd/system/${serviceName}.service 2>/dev/null || echo '-'`;
        const workers = await runSshCommand(host, grepCmd, sshOptions);
        console.log(`  Configured Workers: ${workers.trim()}`);
        
        const portCmd = `grep -oP '(?<=--ipc-port )\\d+' /etc/systemd/system/${serviceName}.service 2>/dev/null || echo '-'`;
        const port = await runSshCommand(host, portCmd, sshOptions);
        console.log(`  IPC Port: ${port.trim()}`);
      } catch {
        // Ignore grep errors
      }
    }
  } catch (error: any) {
    console.error(chalk.red(`  Failed to get status: ${error.message}`));
  }
}

/**
 * Enable autostart for a service
 */
async function enableAutostart(host: string, sshOptions: string | undefined, options: {
  serviceName: string;
  unitPath: string;
  description: string;
  workingDirectory: string;
  envFile: string;
  user: string;
  group: string;
  entryPoint: string;
  workers: number;
  ipcPort: number;
  bindAddress?: string;
  readyUrl?: string;
  healthUrl?: string;
  environment?: string;
  afterServices?: string[];
}): Promise<void> {
  console.log(chalk.blue(`  Creating systemd unit...`));
  
  const unitContent = generateSystemdUnit(options);
  
  // Write unit file via SSH
  const escapedContent = unitContent.replace(/'/g, "'\\''");
  const writeCmd = `echo '${escapedContent}' | sudo tee ${options.unitPath} > /dev/null`;
  
  try {
    await runSshCommand(host, writeCmd, sshOptions);
    console.log(chalk.green(`  ✓ Created ${options.unitPath}`));
    
    // Reload systemd
    await runSshCommand(host, 'sudo systemctl daemon-reload', sshOptions);
    console.log(chalk.green(`  ✓ Reloaded systemd`));
    
    // Enable the service
    await runSshCommand(host, `sudo systemctl enable ${options.serviceName}`, sshOptions);
    console.log(chalk.green(`  ✓ Enabled ${options.serviceName}`));
    
    console.log('');
    console.log(chalk.gray(`  IPC Port: ${options.ipcPort}`));
    console.log(chalk.gray(`  Workers: ${options.workers}`));
    console.log('');
    console.log(chalk.dim(`  To start now: gpd daemon ${options.serviceName.replace('.service', '')} start`));
    console.log(chalk.dim(`  Or: sudo systemctl start ${options.serviceName}`));
  } catch (error: any) {
    console.error(chalk.red(`  Failed: ${error.message}`));
  }
}

/**
 * Disable autostart for a service
 */
async function disableAutostart(host: string, sshOptions: string | undefined, serviceName: string, unitPath: string): Promise<void> {
  console.log(chalk.blue(`  Disabling autostart...`));
  
  try {
    // Stop if running
    await runSshCommand(host, `sudo systemctl stop ${serviceName} 2>/dev/null || true`, sshOptions);
    
    // Disable
    await runSshCommand(host, `sudo systemctl disable ${serviceName} 2>/dev/null || true`, sshOptions);
    console.log(chalk.green(`  ✓ Disabled ${serviceName}`));
    
    // Remove unit file
    await runSshCommand(host, `sudo rm -f ${unitPath}`, sshOptions);
    console.log(chalk.green(`  ✓ Removed ${unitPath}`));
    
    // Reload systemd
    await runSshCommand(host, 'sudo systemctl daemon-reload', sshOptions);
    console.log(chalk.green(`  ✓ Reloaded systemd`));
  } catch (error: any) {
    console.error(chalk.red(`  Failed: ${error.message}`));
  }
}
