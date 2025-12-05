import chalk from 'chalk';
import { execSync } from 'child_process';
import { getServiceConfig, getWorkspaceRoot, getSourceDir, getDeployRepoPath, CONFIG_FILENAME } from '../config/loader.js';
import { DEFAULT_ARTIFACTS, parseSshPort, buildSshUrl } from '../config/types.js';
import { ensureDir, removeDir, copy, exists, joinPath } from '../utils/files.js';

/**
 * Initialize deploy repo if it doesn't exist (lazy init)
 * Creates git repo and adds remote pointing to server bare repo
 */
function initDeployRepoIfNeeded(
  deployRepoPath: string, 
  host: string, 
  bareRepo: string, 
  sshOptions?: string
): boolean {
  if (exists(joinPath(deployRepoPath, '.git'))) {
    return false; // Already initialized
  }

  console.log(chalk.blue('  Initializing deploy repository...'));
  ensureDir(deployRepoPath);
  
  // git init
  execSync('git init', { cwd: deployRepoPath, stdio: 'pipe' });
  
  // Add remote with SSH URL
  const port = parseSshPort(sshOptions);
  const sshUrl = buildSshUrl(host, bareRepo, port);
  execSync(`git remote add origin ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
  
  console.log(chalk.gray(`    Remote: ${sshUrl}`));
  return true;
}

/**
 * Stage command - copy build artifacts to deploy repository
 * 
 * New architecture:
 * - sourceDir: where the project is (e.g., kairox-api-node)
 * - deployRepo: relative to sourceDir (e.g., deploy/staging)
 * - artifacts: copied from sourceDir to deployRepo
 */
export async function stageCommand(serviceName: string): Promise<void> {
  console.log(chalk.blue(`Staging ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const sourceDir = getSourceDir(config, workspaceRoot);
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  const artifacts = config.artifacts || DEFAULT_ARTIFACTS;
  
  // Validate source directory exists
  if (!exists(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  
  console.log(chalk.gray(`  Source: ${config.sourceDir}`));
  console.log(chalk.gray(`  Deploy: ${config.sourceDir}/${config.deployRepo}`));
  
  // Lazy init deploy repo
  const { host, bareRepo, sshOptions } = config.server;
  const wasInitialized = initDeployRepoIfNeeded(deployRepoPath, host, bareRepo, sshOptions);
  if (wasInitialized) {
    console.log(chalk.green('  ✓ Deploy repo initialized'));
  }
  
  // Copy artifacts from sourceDir to deployRepo
  let copiedCount = 0;
  for (const artifact of artifacts) {
    const srcPath = joinPath(sourceDir, artifact);
    const destPath = joinPath(deployRepoPath, artifact);
    
    if (exists(srcPath)) {
      // Remove old artifact first (clean copy)
      removeDir(destPath);
      copy(srcPath, destPath);
      console.log(chalk.gray(`    ${artifact}`));
      copiedCount++;
    } else {
      console.log(chalk.yellow(`  Warning: ${artifact} not found in ${config.sourceDir}`));
    }
  }
  
  if (copiedCount === 0) {
    throw new Error('No artifacts were copied. Check your artifacts config and build output.');
  }
  
  // Copy .git-deploy.json to deploy repo (needed by server-side install)
  const configSrc = joinPath(workspaceRoot, CONFIG_FILENAME);
  const configDest = joinPath(deployRepoPath, CONFIG_FILENAME);
  if (exists(configSrc)) {
    copy(configSrc, configDest);
    console.log(chalk.gray(`    ${CONFIG_FILENAME}`));
  }
  
  console.log(chalk.green(`✓ Staged ${copiedCount} artifact(s) to ${config.sourceDir}/${config.deployRepo}`));
}

/**
 * Dry run version of stage command - shows what would be copied without copying
 */
export async function stageCommandDryRun(serviceName: string): Promise<void> {
  console.log(chalk.blue(`[DRY RUN] Stage preview for ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const sourceDir = getSourceDir(config, workspaceRoot);
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  const artifacts = config.artifacts || DEFAULT_ARTIFACTS;
  
  // Validate source directory exists
  if (!exists(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  
  console.log(chalk.gray(`  Source: ${config.sourceDir}`));
  console.log(chalk.gray(`  Deploy: ${config.sourceDir}/${config.deployRepo}`));
  
  // Check if deploy repo needs init
  if (!exists(joinPath(deployRepoPath, '.git'))) {
    console.log(chalk.yellow(`  Would initialize deploy repo at ${config.deployRepo}`));
  }
  
  // Show what would be copied
  console.log(chalk.gray('  Would copy:'));
  let wouldCopy = 0;
  for (const artifact of artifacts) {
    const srcPath = joinPath(sourceDir, artifact);
    if (exists(srcPath)) {
      console.log(chalk.gray(`    ✓ ${artifact}`));
      wouldCopy++;
    } else {
      console.log(chalk.yellow(`    ✗ ${artifact} (not found)`));
    }
  }
  
  if (wouldCopy === 0) {
    console.log(chalk.red('  No artifacts would be copied!'));
  } else {
    console.log(chalk.gray(`  Total: ${wouldCopy} artifact(s) would be staged`));
  }
}
