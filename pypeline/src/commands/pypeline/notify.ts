import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { readPypelineConfig, writePypelineConfig, type PypelineConfig } from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.notify');

// ── Tipo expandido com campo de webhook ───────────────────────────────────
type NotifyConfig = PypelineConfig & {
  webhookUrl?: string;
  webhookChannel?: string;
};

export type NotifyPayload = {
  event: 'deploy_success' | 'deploy_failure' | 'quickdeploy_success' | 'quickdeploy_failure' | 'test';
  project: string;
  branch: string | null;
  baseline: string | null;
  jobId: string | null;
  message: string;
  timestamp: string;
};

export type PypelineNotifyResult = {
  sent: boolean;
  webhookUrl: string | null;
  payload: NotifyPayload | null;
};

// ── Funções públicas para outros comandos ─────────────────────────────────

export async function sendNotification(payload: NotifyPayload): Promise<boolean> {
  const config = readPypelineConfig() as NotifyConfig;
  const url = config.webhookUrl;
  if (!url) return false;

  try {
    await postJson(url, formatPayload(payload, config.webhookChannel));
    return true;
  } catch {
    return false;
  }
}

function formatPayload(payload: NotifyPayload, channel?: string): Record<string, unknown> {
  // Formato compatível com Slack Incoming Webhooks
  const emoji = payload.event.includes('success') ? '✅' : '❌';
  const text = [
    `${emoji} *Pypeline — ${payload.event.replace(/_/g, ' ').toUpperCase()}*`,
    `> ${payload.message}`,
    payload.branch  ? `Branch: \`${payload.branch}\`` : null,
    payload.baseline ? `Baseline: \`${payload.baseline?.slice(0, 12)}\`` : null,
    payload.jobId    ? `Job ID: \`${payload.jobId}\``  : null,
    `_${payload.timestamp}_`,
  ].filter(Boolean).join('\n');

  const body: Record<string, unknown> = { text };
  if (channel) body['channel'] = channel;

  return body;
}

function postJson(url: string, body: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data   = JSON.stringify(body);
    const mod    = parsed.protocol === 'https:' ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port,
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length':  Buffer.byteLength(data),
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook retornou status ${res.statusCode ?? 'unknown'}`));
        }
        res.resume();
      }
    );

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout (10s)')); });
    req.write(data);
    req.end();
  });
}

// ── Comando ───────────────────────────────────────────────────────────────

export default class PypelineNotify extends SfCommand<PypelineNotifyResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'set-url': Flags.string({
      summary: messages.getMessage('flags.set-url.summary'),
    }),
    'set-channel': Flags.string({
      summary: messages.getMessage('flags.set-channel.summary'),
    }),
    test: Flags.boolean({
      summary: messages.getMessage('flags.test.summary'),
      default: false,
    }),
    remove: Flags.boolean({
      summary: messages.getMessage('flags.remove.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineNotifyResult> {
    const { flags } = await this.parse(PypelineNotify);
    const config = readPypelineConfig() as NotifyConfig;

    // ── set-url ───────────────────────────────────────────────────────
    if (flags['set-url']) {
      try {
        new URL(flags['set-url']);
      } catch {
        this.error('URL inválida. Forneça uma URL completa (https://...).');
      }
      (config as Record<string, unknown>)['webhookUrl'] = flags['set-url'];
      writePypelineConfig(config as PypelineConfig);
      this.log('✔ Webhook URL salva em .pypeline.json');
    }

    // ── set-channel ───────────────────────────────────────────────────
    if (flags['set-channel']) {
      (config as Record<string, unknown>)['webhookChannel'] = flags['set-channel'];
      writePypelineConfig(config as PypelineConfig);
      this.log(`✔ Canal configurado: ${flags['set-channel']}`);
    }

    // ── remove ────────────────────────────────────────────────────────
    if (flags['remove']) {
      delete (config as Record<string, unknown>)['webhookUrl'];
      delete (config as Record<string, unknown>)['webhookChannel'];
      writePypelineConfig(config as PypelineConfig);
      this.log('✔ Webhook removido.');
      return { sent: false, webhookUrl: null, payload: null };
    }

    // ── test ──────────────────────────────────────────────────────────
    if (flags['test']) {
      const url = config.webhookUrl;
      if (!url) {
        this.error('Nenhum webhook configurado. Use --set-url primeiro.');
      }

      this.log(`Enviando notificação de teste para ${url}...`);
      const payload: NotifyPayload = {
        event: 'test',
        project: process.cwd().split('/').pop() ?? 'unknown',
        branch: config.branch ?? null,
        baseline: null,
        jobId: null,
        message: 'Notificação de teste do pypeline. Se você está vendo isso, o webhook está funcionando!',
        timestamp: new Date().toISOString(),
      };

      const sent = await sendNotification(payload);
      if (sent) {
        this.log('✔ Notificação de teste enviada com sucesso!');
      } else {
        this.warn('Falha ao enviar notificação. Verifique a URL do webhook.');
      }
      return { sent, webhookUrl: url, payload };
    }

    // ── Status (sem flags de ação) ────────────────────────────────────
    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║       PYPELINE NOTIFICATIONS                 ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  Webhook URL : ${config.webhookUrl ?? '(não configurado)'}`);
    this.log(`  Canal       : ${config.webhookChannel ?? '(padrão do webhook)'}`);
    this.log('');
    this.log('  Comandos:');
    this.log('    --set-url <url>       Configura a URL do webhook');
    this.log('    --set-channel <name>  Define o canal (Slack)');
    this.log('    --test                Envia notificação de teste');
    this.log('    --remove              Remove o webhook');
    this.log('');

    return { sent: false, webhookUrl: config.webhookUrl ?? null, payload: null };
  }
}
