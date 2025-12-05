#!/usr/bin/env node

import { Command } from 'commander';
import { stageCommand } from './commands/stage.js';
import { releaseCommand } from './commands/release.js';
import { deployCommand } from './commands/deploy.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { installCommand } from './commands/install.js';
import { rollbackCommand } from './commands/rollback.js';
import { configCommand } from './commands/config.js';
import { daemonCommand } from './commands/daemon.js';

const program = new Command();

program
  .name('gpd')
  .description('Git Push Deploy - CLI for git-based deployments with PM2 support')
  .version('0.4.0');

// Development commands (run on dev machine)
program
  .command('stage <service>')
  .description('Copy build artifacts to deploy repository (creates repo if needed)')
  .action(stageCommand);

program
  .command('release <service>')
  .description('Commit and push deploy repository to server')
  .option('-m, --message <message>', 'Commit message')
  .action(releaseCommand);

program
  .command('deploy <service>')
  .description('Stage and push to server (hook handles install)')
  .option('-m, --message <message>', 'Commit message')
  .option('--skip-push', 'Only stage, do not push')
  .option('--dry-run', 'Preview what would happen without making changes')
  .action((service, options) => deployCommand(service, { 
    message: options.message, 
    skipPush: options.skipPush,
    dryRun: options.dryRun
  }));

program
  .command('rollback <service> [target]')
  .description('Rollback to a previous deployment version')
  .option('-s, --steps <n>', 'Go back N commits', parseInt)
  .option('-l, --list', 'List available versions without rollback')
  .option('-f, --force', 'Skip confirmation prompt')
  .action((service, target, options) => rollbackCommand(service, target, {
    steps: options.steps,
    list: options.list,
    force: options.force
  }));

// Server setup command
program
  .command('init <service>')
  .description('Initialize bare repo, target dir, and post-receive hook on server')
  .option('--skip-ssh-check', 'Skip SSH key verification')
  .action((service, options) => initCommand(service, { skipSshCheck: options.skipSshCheck }));

// Server-side command (run by post-receive hook)
program
  .command('install <service>')
  .description('Install service on server (called by post-receive hook)')
  .option('-c, --config <path>', 'Path to .git-deploy.json')
  .action((service, options) => installCommand(service, { configPath: options.config }));

program
  .command('status')
  .description('Show all configured services')
  .action(statusCommand);

program
  .command('logs <service>')
  .description('Show PM2 logs from server via SSH')
  .option('-n, --lines <lines>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action(logsCommand);

program
  .command('config')
  .description('Interactive configuration wizard for .git-deploy.json')
  .option('-e, --edit <service>', 'Edit existing service')
  .option('-l, --list', 'List configured services')
  .action((options) => configCommand({ edit: options.edit, list: options.list }));

program
  .command('daemon <service> <action>')
  .description('Control gpdd daemon on server (status|reload|stop|start)')
  .action((service, action) => daemonCommand(service, action));

program.parse();
