import chalk from 'chalk';
import type { 
  NotificationsConfig, 
  DeploymentResult,
  SlackNotificationConfig,
  DiscordNotificationConfig,
  WebhookNotificationConfig 
} from '../config/types.js';

/**
 * Send deployment notifications to all configured channels
 */
export async function sendNotifications(
  config: NotificationsConfig | undefined,
  result: DeploymentResult
): Promise<void> {
  if (!config) return;

  const promises: Promise<void>[] = [];

  if (config.slack) {
    promises.push(sendSlackNotification(config.slack, result));
  }
  if (config.discord) {
    promises.push(sendDiscordNotification(config.discord, result));
  }
  if (config.webhook) {
    promises.push(sendWebhookNotification(config.webhook, result));
  }

  if (promises.length > 0) {
    console.log(chalk.gray('  Sending notifications...'));
    await Promise.allSettled(promises);
  }
}

/**
 * Build Slack message payload
 */
function buildSlackPayload(config: SlackNotificationConfig, result: DeploymentResult): object {
  const emoji = result.success ? ':white_check_mark:' : ':x:';
  const status = result.success ? 'succeeded' : 'failed';
  const color = result.success ? '#36a64f' : '#dc3545';

  const fields = [
    {
      title: 'Service',
      value: result.service,
      short: true
    },
    {
      title: 'Environment',
      value: result.environment || 'production',
      short: true
    },
    {
      title: 'Servers',
      value: result.servers.join(', '),
      short: true
    },
    {
      title: 'Time',
      value: result.timestamp,
      short: true
    }
  ];

  if (result.duration) {
    fields.push({
      title: 'Duration',
      value: `${result.duration}s`,
      short: true
    });
  }

  if (result.commitHash) {
    fields.push({
      title: 'Commit',
      value: result.commitHash.substring(0, 7),
      short: true
    });
  }

  const payload: Record<string, unknown> = {
    username: config.username || 'GPD',
    icon_emoji: ':rocket:',
    attachments: [
      {
        color,
        fallback: `Deployment ${status}: ${result.service}`,
        title: `${emoji} Deployment ${status}`,
        fields,
        footer: 'git-push-deploy',
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };

  if (config.channel) {
    payload.channel = config.channel;
  }

  if (result.message) {
    (payload.attachments as any[])[0].text = result.message;
  }

  return payload;
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(
  config: SlackNotificationConfig,
  result: DeploymentResult
): Promise<void> {
  if (config.onlyOnFailure && result.success) return;

  try {
    const payload = buildSlackPayload(config, result);
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.log(chalk.yellow(`    ⚠ Slack notification failed: ${response.status}`));
    } else {
      console.log(chalk.green('    ✓ Slack notification sent'));
    }
  } catch (error: any) {
    console.log(chalk.yellow(`    ⚠ Slack notification error: ${error.message}`));
  }
}

/**
 * Build Discord message payload
 */
function buildDiscordPayload(config: DiscordNotificationConfig, result: DeploymentResult): object {
  const emoji = result.success ? '✅' : '❌';
  const status = result.success ? 'succeeded' : 'failed';
  const color = result.success ? 0x36a64f : 0xdc3545;

  return {
    username: config.username || 'GPD',
    embeds: [
      {
        title: `${emoji} Deployment ${status}`,
        color,
        fields: [
          { name: 'Service', value: result.service, inline: true },
          { name: 'Environment', value: result.environment || 'production', inline: true },
          { name: 'Servers', value: result.servers.join(', '), inline: false },
          ...(result.duration ? [{ name: 'Duration', value: `${result.duration}s`, inline: true }] : []),
          ...(result.commitHash ? [{ name: 'Commit', value: result.commitHash.substring(0, 7), inline: true }] : [])
        ],
        footer: { text: 'git-push-deploy' },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

/**
 * Send Discord notification
 */
async function sendDiscordNotification(
  config: DiscordNotificationConfig,
  result: DeploymentResult
): Promise<void> {
  if (config.onlyOnFailure && result.success) return;

  try {
    const payload = buildDiscordPayload(config, result);
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.log(chalk.yellow(`    ⚠ Discord notification failed: ${response.status}`));
    } else {
      console.log(chalk.green('    ✓ Discord notification sent'));
    }
  } catch (error: any) {
    console.log(chalk.yellow(`    ⚠ Discord notification error: ${error.message}`));
  }
}

/**
 * Send generic webhook notification
 */
async function sendWebhookNotification(
  config: WebhookNotificationConfig,
  result: DeploymentResult
): Promise<void> {
  if (config.onlyOnFailure && result.success) return;

  try {
    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify(result)
    });

    if (!response.ok) {
      console.log(chalk.yellow(`    ⚠ Webhook notification failed: ${response.status}`));
    } else {
      console.log(chalk.green('    ✓ Webhook notification sent'));
    }
  } catch (error: any) {
    console.log(chalk.yellow(`    ⚠ Webhook notification error: ${error.message}`));
  }
}
