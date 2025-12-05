import chalk from 'chalk';
import { execSync } from 'child_process';
import { getServiceConfig, getWorkspaceRoot, getDeployRepoPath } from '../config/loader.js';
import { getServers, parseSshPort, buildSshUrl, type DeploymentResult } from '../config/types.js';
import { gitAddAll, gitCommit, gitPush, hasChanges, getCurrentBranch, getGitStatus, getLastCommitHash, getLastCommitMessage } from '../utils/git.js';
import { exists } from '../utils/files.js';
import { joinPath } from '../utils/files.js';
import { sendNotifications } from '../utils/notifications.js';

interface ReleaseOptions {
  message?: string;
}

/**
 * Execute hook commands
 */
function executeHooks(hooks: string[], label: string, cwd: string): boolean {
  if (!hooks || hooks.length === 0) return true;
  
  console.log(chalk.gray(`  Running ${label} hooks...`));
  for (const cmd of hooks) {
    console.log(chalk.gray(`    $ ${cmd}`));
    try {
      execSync(cmd, { cwd, stdio: 'inherit' });
    } catch (error: any) {
      console.log(chalk.red(`  ✗ Hook failed: ${cmd}`));
      return false;
    }
  }
  return true;
}

/**
 * Ensure remotes are set up for all servers
 * Creates remote-0, remote-1, etc. for each server
 */
function ensureRemotes(deployRepoPath: string, serviceName: string): void {
  const config = getServiceConfig(serviceName);
  const servers = getServers(config);
  
  // Get existing remotes
  let existingRemotes: string[] = [];
  try {
    const output = execSync('git remote', { cwd: deployRepoPath, encoding: 'utf-8' });
    existingRemotes = output.trim().split('\n').filter(r => r);
  } catch {
    // No remotes yet
  }
  
  // For single server, use 'origin'
  if (servers.length === 1) {
    const server = servers[0];
    const port = parseSshPort(server.sshOptions);
    const sshUrl = buildSshUrl(server.host, server.bareRepo, port);
    
    if (!existingRemotes.includes('origin')) {
      execSync(`git remote add origin ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
    } else {
      execSync(`git remote set-url origin ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
    }
    return;
  }
  
  // For multi-server, create server-0, server-1, etc.
  servers.forEach((server, index) => {
    const remoteName = `server-${index}`;
    const port = parseSshPort(server.sshOptions);
    const sshUrl = buildSshUrl(server.host, server.bareRepo, port);
    
    if (!existingRemotes.includes(remoteName)) {
      execSync(`git remote add ${remoteName} ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
    } else {
      execSync(`git remote set-url ${remoteName} ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
    }
  });
  
  // Also keep 'origin' pointing to primary server for backwards compat
  const primaryServer = servers[0];
  const port = parseSshPort(primaryServer.sshOptions);
  const sshUrl = buildSshUrl(primaryServer.host, primaryServer.bareRepo, port);
  if (!existingRemotes.includes('origin')) {
    execSync(`git remote add origin ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
  }
}

/**
 * Release command - commit and push deploy repository
 * 
 * Pushes to the bare repo on the server(s), which triggers the post-receive hook.
 */
export async function releaseCommand(serviceName: string, options: ReleaseOptions = {}): Promise<void> {
  console.log(chalk.blue(`Releasing ${serviceName}...`));
  
  const startTime = Date.now();
  const config = getServiceConfig(serviceName);
  const servers = getServers(config);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  const sourceDir = joinPath(workspaceRoot, config.sourceDir);
  
  // Run pre-deploy hooks (local, in source directory)
  if (config.hooks?.preDeploy) {
    if (!executeHooks(config.hooks.preDeploy, 'pre-deploy', sourceDir)) {
      console.log(chalk.red('✗ Pre-deploy hooks failed, aborting release.'));
      await sendNotifications(config.notifications, {
        service: serviceName,
        environment: config.environment,
        servers: servers.map(s => s.name || s.host),
        success: false,
        message: 'Pre-deploy hooks failed',
        timestamp: new Date().toISOString()
      });
      return;
    }
  }
  
  // Check for changes
  if (!hasChanges(deployRepoPath)) {
    console.log(chalk.yellow('No changes to release.'));
    return;
  }
  
  // Ensure remotes are configured
  ensureRemotes(deployRepoPath, serviceName);
  
  // Commit
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const message = options.message || `deploy: ${serviceName} @ ${timestamp}`;
  gitAddAll(deployRepoPath);
  
  const committed = gitCommit(deployRepoPath, message);
  if (!committed) {
    console.log(chalk.yellow('No changes to commit.'));
    return;
  }
  
  const branch = getCurrentBranch(deployRepoPath);
  
  // Push to each server
  let pushSuccess = true;
  const failedServers: string[] = [];
  
  if (servers.length === 1) {
    console.log(chalk.gray(`  Pushing to origin/${branch}...`));
    try {
      gitPush(deployRepoPath, 'origin', branch);
    } catch (error: any) {
      pushSuccess = false;
      failedServers.push(servers[0].name || servers[0].host);
    }
  } else {
    console.log(chalk.gray(`  Pushing to ${servers.length} servers...`));
    for (let i = 0; i < servers.length; i++) {
      const remoteName = `server-${i}`;
      const serverLabel = servers[i].name || servers[i].host;
      console.log(chalk.gray(`    → ${serverLabel}...`));
      try {
        gitPush(deployRepoPath, remoteName, branch);
        console.log(chalk.green(`    ✓ ${serverLabel}`));
      } catch (error: any) {
        console.log(chalk.red(`    ✗ ${serverLabel}: ${error.message}`));
        pushSuccess = false;
        failedServers.push(serverLabel);
      }
    }
  }
  
  // Run post-deploy-local hooks (local, after successful push)
  if (pushSuccess && config.hooks?.postDeployLocal) {
    executeHooks(config.hooks.postDeployLocal, 'post-deploy-local', sourceDir);
  }
  
  // Calculate duration
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  // Get commit info for notification
  const commitHash = getLastCommitHash(deployRepoPath);
  const commitMessage = getLastCommitMessage(deployRepoPath);
  
  // Send notifications
  const result: DeploymentResult = {
    service: serviceName,
    environment: config.environment,
    servers: servers.map(s => s.name || s.host),
    success: pushSuccess,
    message: pushSuccess ? undefined : `Failed on: ${failedServers.join(', ')}`,
    timestamp: new Date().toISOString(),
    duration,
    commitHash,
    commitMessage
  };
  
  await sendNotifications(config.notifications, result);
  
  if (pushSuccess) {
    console.log(chalk.green(`✓ Released ${serviceName}`));
  } else {
    console.log(chalk.yellow(`⚠ Released with errors: ${failedServers.join(', ')}`));
  }
}

/**
 * Dry run version of release command - shows what would be committed/pushed
 */
export async function releaseCommandDryRun(serviceName: string): Promise<void> {
  console.log(chalk.blue(`[DRY RUN] Release preview for ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const servers = getServers(config);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  
  // Check if deploy repo exists
  if (!exists(joinPath(deployRepoPath, '.git'))) {
    console.log(chalk.yellow('  Deploy repo not initialized yet'));
    console.log(chalk.gray('  Would be created on first deploy'));
    return;
  }
  
  // Check for changes
  if (!hasChanges(deployRepoPath)) {
    console.log(chalk.yellow('  No changes to release'));
    return;
  }
  
  // Show what would be committed
  const status = getGitStatus(deployRepoPath);
  console.log(chalk.gray('  Would commit:'));
  for (const line of status.split('\n').filter(l => l.trim())) {
    const [flag, ...fileParts] = line.trim().split(' ');
    const file = fileParts.join(' ');
    if (flag === 'M' || flag === 'MM') {
      console.log(chalk.yellow(`    M ${file}`));
    } else if (flag === 'A' || flag === '??') {
      console.log(chalk.green(`    A ${file}`));
    } else if (flag === 'D') {
      console.log(chalk.red(`    D ${file}`));
    } else {
      console.log(chalk.gray(`    ${line.trim()}`));
    }
  }
  
  const branch = getCurrentBranch(deployRepoPath);
  if (servers.length === 1) {
    console.log(chalk.gray(`  Would push to: origin/${branch}`));
    console.log(chalk.gray(`  Server: ${servers[0].host}`));
  } else {
    console.log(chalk.gray(`  Would push to ${servers.length} servers:`));
    servers.forEach((s, i) => {
      console.log(chalk.gray(`    server-${i}: ${s.name || s.host}`));
    });
  }
}
