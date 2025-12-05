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
 * Get git status output (for display)
 */
export function getGitStatus(repoDir: string): string {
  return execOutput('git status --porcelain', repoDir);
}

/**
 * Get commit log (one line per commit)
 * Format: hash message (tag if exists)
 */
export function getCommitLog(repoDir: string, count: number = 10): string[] {
  try {
    // Use format that includes decorations (tags, branches)
    const output = execOutput(
      `git log --oneline --decorate=short -${count}`,
      repoDir
    );
    return output.split('\n').filter(line => line.trim());
  } catch {
    return [];
  }
}

/**
 * Get commit log with more details (hash, date, message, tags)
 */
export function getCommitLogDetailed(repoDir: string, count: number = 10): Array<{
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  tags: string[];
}> {
  try {
    // Format: hash|date|message|refs
    const output = execOutput(
      `git log --format="%H|%ci|%s|%D" -${count}`,
      repoDir
    );
    
    return output.split('\n').filter(line => line.trim()).map(line => {
      const [hash, date, message, refs] = line.split('|');
      
      // Extract tags from refs (e.g., "HEAD -> main, tag: v1.0.0")
      const tags: string[] = [];
      if (refs) {
        const tagMatches = refs.match(/tag:\s*([^,)]+)/g);
        if (tagMatches) {
          for (const match of tagMatches) {
            tags.push(match.replace('tag:', '').trim());
          }
        }
      }
      
      return {
        hash,
        shortHash: hash.substring(0, 7),
        message: message || '',
        date: date ? date.substring(0, 10) : '', // Just date part
        tags
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get current commit hash
 */
export function getCurrentCommit(repoDir: string): string {
  return execOutput('git rev-parse HEAD', repoDir);
}

/**
 * Get last commit hash (short form)
 */
export function getLastCommitHash(repoDir: string): string {
  try {
    return execOutput('git rev-parse --short HEAD', repoDir);
  } catch {
    return '';
  }
}

/**
 * Get last commit message (first line)
 */
export function getLastCommitMessage(repoDir: string): string {
  try {
    return execOutput('git log -1 --format=%s', repoDir);
  } catch {
    return '';
  }
}

/**
 * Get commit hash by reference (tag, branch, HEAD~n, etc.)
 */
export function getCommitByRef(repoDir: string, ref: string): string {
  return execOutput(`git rev-parse ${ref}`, repoDir);
}

/**
 * Reset to a specific commit (hard reset)
 */
export function gitResetHard(repoDir: string, commit: string): void {
  exec(`git reset --hard ${commit}`, { cwd: repoDir });
}

/**
 * Force push to remote
 */
export function gitPushForce(repoDir: string, remote: string = 'origin', branch: string = 'main'): void {
  exec(`git push --force ${remote} ${branch}`, { cwd: repoDir });
}

/**
 * Initialize bare repo
 */
export function initBareRepo(path: string): void {
  exec(`git init --bare --shared=group ${path}`);
}
