import { existsSync, mkdirSync, rmSync, cpSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Ensure directory exists
 */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/**
 * Remove directory recursively
 */
export function removeDir(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

/**
 * Copy file or directory
 */
export function copy(src: string, dest: string): void {
  ensureDir(dirname(dest));
  cpSync(src, dest, { recursive: true });
}

/**
 * Check if path exists
 */
export function exists(path: string): boolean {
  return existsSync(path);
}

/**
 * List directory contents
 */
export function listDir(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  return readdirSync(path);
}

/**
 * Join paths
 */
export function joinPath(...parts: string[]): string {
  return join(...parts);
}
