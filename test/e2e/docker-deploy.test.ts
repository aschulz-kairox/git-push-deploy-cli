/**
 * E2E Tests for GPD CLI using Docker test-server
 * 
 * Prerequisites:
 * - Docker test-server running on port 2222 (SSH) and 3100 (service)
 * - SSH key configured for deploy@localhost
 * 
 * Run: npm test
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import * as http from 'http';

const TEST_DIR = join(process.cwd(), 'test', 'e2e', 'tmp');
const GPD_CLI = join(process.cwd(), 'dist', 'index.js');
const SSH_HOST = 'deploy@localhost';
const SSH_PORT = '2222';
const SERVICE_PORT = 3100;

/**
 * Execute gpd command and return output
 */
function gpd(args: string, cwd?: string): string {
  const cmd = `node "${GPD_CLI}" ${args}`;
  try {
    return execSync(cmd, { 
      cwd: cwd || TEST_DIR, 
      encoding: 'utf-8',
      env: { ...process.env, FORCE_COLOR: '0' }
    });
  } catch (error: any) {
    console.error(`Command failed: ${cmd}`);
    console.error(error.stdout?.toString() || '');
    console.error(error.stderr?.toString() || '');
    throw error;
  }
}

/**
 * Execute SSH command on test server
 */
function ssh(cmd: string): string {
  return execSync(`ssh -p ${SSH_PORT} -o StrictHostKeyChecking=no ${SSH_HOST} "${cmd}"`, {
    encoding: 'utf-8'
  });
}

/**
 * HTTP GET request
 */
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    }).on('error', reject);
  });
}

/**
 * Wait for service to be ready
 */
async function waitForService(port: number, timeout: number = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await httpGet(`http://localhost:${port}/health`);
      if (response.status === 200) return true;
    } catch {
      // Service not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Setup test project
 */
function setupTestProject(name: string): string {
  const projectDir = join(TEST_DIR, name);
  
  // Clean up
  if (existsSync(projectDir)) {
    rmSync(projectDir, { recursive: true });
  }
  mkdirSync(projectDir, { recursive: true });
  
  // Create package.json
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    main: 'dist/index.js',
    scripts: {
      start: 'node dist/index.js'
    }
  }, null, 2));
  
  // Create source
  mkdirSync(join(projectDir, 'src'), { recursive: true });
  writeFileSync(join(projectDir, 'src', 'index.ts'), `
import http from 'http';

const PORT = process.env.PORT || 3100;
const VERSION = '${Date.now()}';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: VERSION }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(\`Hello from test service v\${VERSION}\`);
  }
});

server.listen(PORT, () => {
  console.log(\`Test service running on port \${PORT}\`);
});
`);
  
  // Create dist (simulated build)
  mkdirSync(join(projectDir, 'dist'), { recursive: true });
  writeFileSync(join(projectDir, 'dist', 'index.js'), `
import http from 'http';

const PORT = process.env.PORT || 3100;
const VERSION = '${Date.now()}';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: VERSION }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(\`Hello from test service v\${VERSION}\`);
  }
});

server.listen(PORT, () => {
  console.log(\`Test service running on port \${PORT}\`);
});
`);
  
  // Create ecosystem.config.cjs
  writeFileSync(join(projectDir, 'ecosystem.config.cjs'), `
module.exports = {
  apps: [{
    name: '${name}',
    script: 'dist/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3100
    }
  }]
};
`);
  
  // Create .git-deploy.json
  writeFileSync(join(projectDir, '.git-deploy.json'), JSON.stringify({
    services: {
      [name]: {
        sourceDir: '.',
        deployRepo: 'deploy',
        artifacts: ['dist', 'package.json', 'ecosystem.config.cjs'],
        processManager: 'pm2',
        processName: name,
        pm2User: 'deploy',
        pm2Home: `/opt/${name}/.pm2`,
        environment: 'production',
        server: {
          host: SSH_HOST,
          sshOptions: `-p ${SSH_PORT} -o StrictHostKeyChecking=no`,
          targetDir: `/opt/${name}`,
          bareRepo: `/git/${name}.git`
        }
      }
    }
  }, null, 2));
  
  // Initialize git
  execSync('git init', { cwd: projectDir });
  execSync('git add .', { cwd: projectDir });
  execSync('git commit -m "Initial commit"', { cwd: projectDir });
  
  return projectDir;
}

/**
 * Cleanup server-side resources
 */
function cleanupServer(name: string): void {
  try {
    // Stop PM2 process if running
    ssh(`sudo -u deploy PM2_HOME=/opt/${name}/.pm2 pm2 delete ${name} 2>/dev/null || true`);
    // Remove directories
    ssh(`sudo rm -rf /opt/${name} /git/${name}.git 2>/dev/null || true`);
  } catch {
    // Ignore cleanup errors
  }
}

describe('GPD E2E Tests', () => {
  const serviceName = 'e2e-test-service';
  let projectDir: string;
  
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });
  
  beforeEach(() => {
    // Clean up server before each test
    cleanupServer(serviceName);
  });
  
  afterAll(() => {
    // Final cleanup
    cleanupServer(serviceName);
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });
  
  describe('Config Command', () => {
    test('gpd config --list shows no services', () => {
      const emptyDir = join(TEST_DIR, 'empty');
      mkdirSync(emptyDir, { recursive: true });
      const output = gpd('config --list', emptyDir);
      expect(output).toContain('No services configured');
    });
    
    test('gpd config --list shows configured services', () => {
      projectDir = setupTestProject(serviceName);
      const output = gpd('config --list', projectDir);
      expect(output).toContain(serviceName);
      expect(output).toContain(SSH_HOST);
    });
  });
  
  describe('Status Command', () => {
    test('gpd status shows services', () => {
      projectDir = setupTestProject(serviceName);
      const output = gpd('status', projectDir);
      expect(output).toContain(serviceName);
    });
  });
  
  describe('Init Command', () => {
    test('gpd init creates bare repo and hook', () => {
      projectDir = setupTestProject(serviceName);
      
      // Run init (skip SSH check since we're using non-standard port)
      const output = gpd(`init ${serviceName} --skip-ssh-check`, projectDir);
      
      expect(output).toContain('Creating target directory');
      expect(output).toContain('Creating bare repo');
      expect(output).toContain('Creating post-receive hook');
      
      // Verify server-side
      const bareRepoExists = ssh(`test -d /git/${serviceName}.git && echo "yes"`);
      expect(bareRepoExists.trim()).toBe('yes');
      
      const hookExists = ssh(`test -x /git/${serviceName}.git/hooks/post-receive && echo "yes"`);
      expect(hookExists.trim()).toBe('yes');
    });
  });
  
  describe('Deploy Command', () => {
    test('gpd deploy --dry-run shows preview', () => {
      projectDir = setupTestProject(serviceName);
      
      const output = gpd(`deploy ${serviceName} --dry-run`, projectDir);
      
      expect(output).toContain('DRY RUN');
      expect(output).toContain('dist');
      expect(output).toContain('package.json');
    });
    
    test('gpd deploy creates deployment', async () => {
      projectDir = setupTestProject(serviceName);
      
      // First init
      gpd(`init ${serviceName} --skip-ssh-check`, projectDir);
      
      // Deploy
      const output = gpd(`deploy ${serviceName}`, projectDir);
      
      expect(output).toContain('Staged');
      expect(output).toContain('Released');
      
      // Wait for service
      const ready = await waitForService(SERVICE_PORT, 15000);
      expect(ready).toBe(true);
      
      // Verify response
      const response = await httpGet(`http://localhost:${SERVICE_PORT}/health`);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).status).toBe('ok');
    }, 30000);
  });
  
  describe('Rollback Command', () => {
    test('gpd rollback --list shows versions', async () => {
      projectDir = setupTestProject(serviceName);
      
      // Init and deploy twice
      gpd(`init ${serviceName} --skip-ssh-check`, projectDir);
      gpd(`deploy ${serviceName} -m "v1"`, projectDir);
      
      // Modify and deploy again
      const distFile = join(projectDir, 'dist', 'index.js');
      const content = readFileSync(distFile, 'utf-8');
      writeFileSync(distFile, content.replace(/VERSION = '[^']+'/g, "VERSION = 'v2'"));
      gpd(`deploy ${serviceName} -m "v2"`, projectDir);
      
      // List versions
      const output = gpd(`rollback ${serviceName} --list`, projectDir);
      expect(output).toContain('v1');
      expect(output).toContain('v2');
    }, 60000);
  });
});

// Run tests if executed directly
if (process.argv[1].endsWith('docker-deploy.test.ts')) {
  console.log('Running E2E tests...');
}
