import chalk from 'chalk';
import { getServiceConfig, getWorkspaceRoot, getDeployRepoPath } from '../config/loader.js';
import { gitAddAll, gitCommit, gitPush, hasChanges, getCurrentBranch, getGitStatus } from '../utils/git.js';
import { exists } from '../utils/files.js';
import { joinPath } from '../utils/files.js';

interface ReleaseOptions {
  message?: string;
}

/**
 * Release command - commit and push deploy repository
 * 
 * Pushes to the bare repo on the server, which triggers the post-receive hook.
 */
export async function releaseCommand(serviceName: string, options: ReleaseOptions = {}): Promise<void> {
  console.log(chalk.blue(`Releasing ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  
  // Check for changes
  if (!hasChanges(deployRepoPath)) {
    console.log(chalk.yellow('No changes to release.'));
    return;
  }
  
  // Commit
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const message = options.message || `deploy: ${serviceName} @ ${timestamp}`;
  gitAddAll(deployRepoPath);
  
  const committed = gitCommit(deployRepoPath, message);
  if (!committed) {
    console.log(chalk.yellow('No changes to commit.'));
    return;
  }
  
  // Push (this triggers the post-receive hook on the server)
  const branch = getCurrentBranch(deployRepoPath);
  console.log(chalk.gray(`  Pushing to origin/${branch}...`));
  gitPush(deployRepoPath, 'origin', branch);
  
  console.log(chalk.green(`✓ Released ${serviceName}`));
}

/**
 * Dry run version of release command - shows what would be committed/pushed
 */
export async function releaseCommandDryRun(serviceName: string): Promise<void> {
  console.log(chalk.blue(`[DRY RUN] Release preview for ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
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
  console.log(chalk.gray(`  Would push to: origin/${branch}`));
  console.log(chalk.gray(`  Server: ${config.server.host}`));
}
