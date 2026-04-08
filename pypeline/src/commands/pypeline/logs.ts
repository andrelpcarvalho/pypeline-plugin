import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  LOG_PRD,
  LOG_TRAINING,
  LOG_QUICK_DEPLOY,
  fileExists,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.logs');

type LogTarget = 'prd' | 'training' | 'quickdeploy';

type LogEntry = {
  line: number;
  level: 'error' | 'warning' | 'info';
  content: string;
};

export type PypelineLogsResult = {
  target: LogTarget;
  logPath: string;
  totalLines: number;
  errors: number;
  warnings: number;
  entries: LogEntry[];
};

const ERROR_PATTERNS   = [/Status\s*:\s*Failed/i, /error/i, /exception/i, /ENOENT/i, /falhou/i];
const WARNING_PATTERNS = [/warning/i, /warn/i, /aviso/i, /deprecated/i];

function classifyLine(line: string): 'error' | 'warning' | 'info' {
  for (const p of ERROR_PATTERNS)   { if (p.test(line)) return 'error'; }
  for (const p of WARNING_PATTERNS) { if (p.test(line)) return 'warning'; }
  return 'info';
}

const LOG_MAP: Record<LogTarget, () => string> = {
  prd:         LOG_PRD,
  training:    LOG_TRAINING,
  quickdeploy: LOG_QUICK_DEPLOY,
};

export default class PypelineLogs extends SfCommand<PypelineLogsResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    target: Flags.string({
      char: 't',
      summary: messages.getMessage('flags.target.summary'),
      options: ['prd', 'training', 'quickdeploy'],
      default: 'prd',
    }),
    level: Flags.string({
      char: 'l',
      summary: messages.getMessage('flags.level.summary'),
      options: ['all', 'error', 'warning'],
      default: 'all',
    }),
    tail: Flags.integer({
      summary: messages.getMessage('flags.tail.summary'),
      default: 0,
    }),
  };

  public async run(): Promise<PypelineLogsResult> {
    const { flags } = await this.parse(PypelineLogs);
    const target = (flags['target'] ?? 'prd') as LogTarget;
    const level  = (flags['level'] ?? 'all') as 'all' | 'error' | 'warning';
    const tail   = flags['tail'] ?? 0;

    const logPath = LOG_MAP[target]();

    if (!fileExists(logPath)) {
      this.error(`Log não encontrado: ${logPath}\nExecute o comando correspondente primeiro.`);
    }

    const raw   = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split('\n');

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log(`║  PYPELINE LOGS — ${target.toUpperCase().padEnd(28)}║`);
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  Arquivo : ${logPath}`);
    this.log(`  Linhas  : ${lines.length}`);

    // ── Classificar todas as linhas ───────────────────────────────────────
    const allEntries: LogEntry[] = lines.map((content, i) => ({
      line: i + 1,
      level: classifyLine(content),
      content,
    }));

    const errors   = allEntries.filter((e) => e.level === 'error').length;
    const warnings = allEntries.filter((e) => e.level === 'warning').length;

    this.log(`  Erros   : ${errors}`);
    this.log(`  Avisos  : ${warnings}`);
    this.log('');

    // ── Filtrar ───────────────────────────────────────────────────────────
    let filtered = allEntries;
    if (level === 'error')   filtered = allEntries.filter((e) => e.level === 'error');
    if (level === 'warning') filtered = allEntries.filter((e) => e.level === 'error' || e.level === 'warning');

    if (tail > 0) {
      filtered = filtered.slice(-tail);
    }

    // ── Output formatado ──────────────────────────────────────────────────
    const COLORS: Record<string, string> = {
      error:   '\x1b[31m',
      warning: '\x1b[33m',
      info:    '\x1b[0m',
    };
    const RESET   = '\x1b[0m';
    const ICONS: Record<string, string> = {
      error:   '✘',
      warning: '⚠',
      info:    '│',
    };

    for (const entry of filtered) {
      if (!entry.content.trim()) continue;
      const color = COLORS[entry.level] ?? '';
      const icon  = ICONS[entry.level] ?? '│';
      const lineNum = String(entry.line).padStart(5);
      this.log(`${color}  ${lineNum} ${icon} ${entry.content}${RESET}`);
    }

    this.log('');

    if (errors > 0) {
      this.log('╔══════════════════════════════════════════════╗');
      this.log(`║  ${errors} erro(s) encontrado(s).`.padEnd(47) + '║');
      this.log('║  Corrija e execute sf pypeline run novamente.║');
      this.log('╚══════════════════════════════════════════════╝');
    } else {
      this.log('  ✔ Nenhum erro encontrado no log.');
    }

    this.log('');

    return { target, logPath, totalLines: lines.length, errors, warnings, entries: filtered };
  }
}
