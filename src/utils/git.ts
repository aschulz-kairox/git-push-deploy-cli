import { exec, execOutput } from './shell.js';

/**
 * Git archive from bare repo
 */
export function gitArchive(bareRepo: string, ref: string, path: string, targetDir: string): void {
  exec(`git archive ${ref} ${path}/ | tar -x -C ${targetDir}`, { cwd: bareRepo });
}

/**
 * Git add all changes
 */
export function gitAddAll(repoDir: string): void {
  exec('git add -A', { cwd: repoDir, silent: true });
}

/**
 * Git commit with message
 */
export function gitCommit(repoDir: string, message: string): boolean {
  try {
    exec(`git commit -m "${message}"`, { cwd: repoDir, silent: true });
    return true;
  } catch {
    // No changes to commit
    return false;
  }
}

/**
 * Git push with tags
 */
export function gitPush(repoDir: string, remote: string = 'origin', branch: string = 'main'): void {
  exec(`git push ${remote} ${branch} --tags`, { cwd: repoDir });
}

/**
 * Get current branch name
 */
export function getCurrentBranch(repoDir: string): string {
  return execOutput('git rev-parse --abbrev-ref HEAD', repoDir);
}

/**
 * Get latest tag
 */
export function getLatestTag(repoDir: string): string | null {
  try {
    return execOutput('git describe --tags --abbrev=0', repoDir);
  } catch {
    return null;
  }
}

/**
 * Check if repo has uncommitted changes
 */
export function hasChanges(repoDir: string): boolean {
  const status = execOutput('git status --porcelain', repoDir);
  return status.length > 0;
}

/**
 * Initialize bare repo
 */
export function initBareRepo(path: string): void {
  exec(`git init --bare --shared=group ${path}`);
}
