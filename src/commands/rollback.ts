import chalk from 'chalk';
import * as readline from 'readline';
import { getServiceConfig, getWorkspaceRoot, getDeployRepoPath } from '../config/loader.js';
import { getCommitLogDetailed, getCurrentCommit, getCommitByRef, gitResetHard, gitPushForce, getCurrentBranch } from '../utils/git.js';
import { exists, joinPath } from '../utils/files.js';

interface RollbackOptions {
  force?: boolean;
  steps?: number;
  list?: boolean;
}

/**
 * Prompt user for confirmation
 */
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Prompt user to select a number
 */
async function promptNumber(prompt: string, max: number): Promise<number> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'q' || answer.toLowerCase() === 'quit') {
        resolve(-1);
        return;
      }
      const num = parseInt(answer, 10);
      if (num >= 1 && num <= max) {
        resolve(num - 1);
      } else {
        resolve(-1);
      }
    });
  });
}

/**
 * Rollback command - revert to a previous deployment
 * 
 * Usage:
 *   gpd rollback <service>           - Interactive selection from recent commits
 *   gpd rollback <service> --steps 2 - Go back 2 commits
 *   gpd rollback <service> --list    - Show available versions without rollback
 *   gpd rollback <service> abc123    - Rollback to specific commit
 */
export async function rollbackCommand(serviceName: string, target?: string, options: RollbackOptions = {}): Promise<void> {
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  
  // Check if deploy repo exists
  if (!exists(joinPath(deployRepoPath, '.git'))) {
    throw new Error(`Deploy repo not found at ${deployRepoPath}. Have you deployed before?`);
  }
  
  const currentCommit = getCurrentCommit(deployRepoPath);
  const branch = getCurrentBranch(deployRepoPath);
  
  // List mode - just show versions
  if (options.list) {
    console.log(chalk.blue(`Deployment history for ${serviceName}:`));
    console.log('');
    
    const commits = getCommitLogDetailed(deployRepoPath, 15);
    commits.forEach((commit, index) => {
      const tagInfo = commit.tags.length > 0 ? chalk.cyan(` [${commit.tags.join(', ')}]`) : '';
      const current = index === 0 ? chalk.green(' (current)') : '';
      console.log(
        chalk.yellow(commit.shortHash) + 
        chalk.gray(` ${commit.date} `) + 
        commit.message + 
        tagInfo + 
        current
      );
    });
    return;
  }
  
  console.log(chalk.blue(`Rollback ${serviceName}...`));
  console.log(chalk.gray(`  Current: ${currentCommit.substring(0, 7)}`));
  console.log(chalk.gray(`  Branch: ${branch}`));
  console.log('');
  
  let targetCommit: string;
  
  if (target) {
    // Specific commit/ref provided
    try {
      targetCommit = getCommitByRef(deployRepoPath, target);
      console.log(chalk.gray(`  Target: ${targetCommit.substring(0, 7)} (from ${target})`));
    } catch {
      throw new Error(`Invalid commit reference: ${target}`);
    }
  } else if (options.steps) {
    // Go back N steps
    try {
      targetCommit = getCommitByRef(deployRepoPath, `HEAD~${options.steps}`);
      const commits = getCommitLogDetailed(deployRepoPath, options.steps + 1);
      const targetInfo = commits[options.steps];
      if (targetInfo) {
        const tagInfo = targetInfo.tags.length > 0 ? chalk.cyan(` [${targetInfo.tags.join(', ')}]`) : '';
        console.log(chalk.gray(`  Target: ${targetInfo.shortHash} ${targetInfo.message}${tagInfo}`));
      }
    } catch {
      throw new Error(`Cannot go back ${options.steps} commits`);
    }
  } else {
    // Interactive selection - show detailed commit list
    const commits = getCommitLogDetailed(deployRepoPath, 10);
    
    if (commits.length <= 1) {
      throw new Error('No previous commits to rollback to');
    }
    
    // Skip first commit (current) and display the rest
    const previousCommits = commits.slice(1);
    
    console.log(chalk.blue('Available versions to rollback to:'));
    console.log('');
    previousCommits.forEach((commit, index) => {
      const tagInfo = commit.tags.length > 0 ? chalk.cyan(` [${commit.tags.join(', ')}]`) : '';
      console.log(chalk.white(`  ${index + 1}) `) + chalk.yellow(commit.shortHash) + chalk.gray(` ${commit.date} `) + commit.message + tagInfo);
    });
    console.log('');
    
    const selection = await promptNumber(`Select version (1-${previousCommits.length}, q to quit): `, previousCommits.length);
    if (selection < 0) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
    
    targetCommit = previousCommits[selection].hash;
    const selected = previousCommits[selection];
    const tagInfo = selected.tags.length > 0 ? ` [${selected.tags.join(', ')}]` : '';
    console.log(chalk.gray(`  Selected: ${selected.shortHash} ${selected.message}${tagInfo}`));
  }
  
  // Check if we're already at target
  if (targetCommit === currentCommit) {
    console.log(chalk.yellow('Already at target commit'));
    return;
  }
  
  // Confirm unless --force
  if (!options.force) {
    console.log('');
    console.log(chalk.yellow.bold('⚠ Warning: This will:'));
    console.log(chalk.yellow(`  1. Reset deploy repo to ${targetCommit.substring(0, 7)}`));
    console.log(chalk.yellow(`  2. Force push to server`));
    console.log(chalk.yellow(`  3. Server will checkout and restart with old version`));
    console.log('');
    
    const shouldContinue = await confirm('Continue with rollback?');
    if (!shouldContinue) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
  }
  
  // Perform rollback
  console.log('');
  console.log(chalk.blue('Performing rollback...'));
  
  // 1. Reset local deploy repo
  console.log(chalk.gray(`  Resetting to ${targetCommit.substring(0, 7)}...`));
  gitResetHard(deployRepoPath, targetCommit);
  
  // 2. Force push to server
  console.log(chalk.gray(`  Force pushing to origin/${branch}...`));
  gitPushForce(deployRepoPath, 'origin', branch);
  
  console.log('');
  console.log(chalk.green.bold(`✓ Rolled back ${serviceName} to ${targetCommit.substring(0, 7)}`));
  console.log(chalk.gray('  The server hook will handle: git checkout, npm install, pm2 restart'));
  console.log(chalk.gray(`  Check logs: gpd logs ${serviceName}`));
}
