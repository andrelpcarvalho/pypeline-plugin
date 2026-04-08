import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.history');

// ── Tipos ─────────────────────────────────────────────────────────────────

export type HistoryEntry = {
  timestamp: string;
  action: 'run' | 'quickdeploy' | 'training' | 'rollback';
  success: boolean;
  baselineFrom: string;
  baselineTo: string;
  jobId: string | null;
  branch: string | null;
  filesDeployed: number;
  duration?: number;   // ms
  targetOrg?: string;
};

export type PypelineHistoryResult = {
  entries: HistoryEntry[];
  historyFile: string;
};

const HISTORY_FILE = (): string => path.join(process.cwd(), '.pypeline-history.json');

// ── API pública para outros comandos registrarem eventos ──────────────────

export function appendHistoryEntry(entry: HistoryEntry): void {
  const file = HISTORY_FILE();
  let entries: HistoryEntry[] = [];
  if (fs.existsSync(file)) {
    try {
      entries = JSON.parse(fs.readFileSync(file, 'utf8')) as HistoryEntry[];
    } catch {
      entries = [];
    }
  }
  entries.push(entry);

  // Mantém no máximo 200 entradas (FIFO)
  if (entries.length > 200) {
    entries = entries.slice(-200);
  }

  fs.writeFileSync(file, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

export function readHistory(): HistoryEntry[] {
  const file = HISTORY_FILE();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

// ── Comando ───────────────────────────────────────────────────────────────

export default class PypelineHistory extends SfCommand<PypelineHistoryResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    limit: Flags.integer({
      char: 'n',
      summary: messages.getMessage('flags.limit.summary'),
      default: 20,
    }),
    action: Flags.string({
      char: 'a',
      summary: messages.getMessage('flags.action.summary'),
      options: ['run', 'quickdeploy', 'training', 'rollback', 'all'],
      default: 'all',
    }),
    'only-failures': Flags.boolean({
      summary: messages.getMessage('flags.only-failures.summary'),
      default: false,
    }),
    clear: Flags.boolean({
      summary: messages.getMessage('flags.clear.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineHistoryResult> {
    const { flags } = await this.parse(PypelineHistory);
    const historyFile = HISTORY_FILE();

    // ── Clear ─────────────────────────────────────────────────────────
    if (flags['clear']) {
      const confirmed = await this.confirm({ message: 'Limpar todo o histórico de deploys?' });
      if (confirmed) {
        try { fs.unlinkSync(historyFile); } catch { /* noop */ }
        this.log('✔ Histórico limpo.');
      }
      return { entries: [], historyFile };
    }

    // ── Leitura ───────────────────────────────────────────────────────
    let entries = readHistory();

    if (entries.length === 0) {
      this.log('');
      this.log('  Nenhum registro no histórico.');
      this.log('  O histórico é preenchido automaticamente a cada sf pypeline run.');
      this.log('');
      return { entries: [], historyFile };
    }

    // ── Filtros ───────────────────────────────────────────────────────
    const actionFilter = flags['action'] ?? 'all';
    if (actionFilter !== 'all') {
      entries = entries.filter((e) => e.action === actionFilter);
    }
    if (flags['only-failures']) {
      entries = entries.filter((e) => !e.success);
    }

    // Mais recentes primeiro, limitado
    entries = entries.reverse().slice(0, flags['limit'] ?? 20);

    // ── Output ────────────────────────────────────────────────────────
    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║         PYPELINE DEPLOY HISTORY              ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');

    const SUCCESS_ICON = '\x1b[32m✔\x1b[0m';
    const FAIL_ICON    = '\x1b[31m✘\x1b[0m';

    for (const entry of entries) {
      const icon = entry.success ? SUCCESS_ICON : FAIL_ICON;
      const date = entry.timestamp.replace('T', ' ').slice(0, 19);
      const from = entry.baselineFrom.slice(0, 8);
      const to   = entry.baselineTo.slice(0, 8);
      const action = entry.action.padEnd(12);
      const files  = entry.filesDeployed > 0 ? `${entry.filesDeployed} files` : '';
      const org    = entry.targetOrg ? `→ ${entry.targetOrg}` : '';
      const dur    = entry.duration ? `(${Math.round(entry.duration / 1000)}s)` : '';

      this.log(`  ${icon} ${date}  ${action} ${from}→${to}  ${files} ${org} ${dur}`);
      if (entry.jobId) {
        this.log(`    Job ID: ${entry.jobId}`);
      }
    }

    this.log('');
    this.log(`  Exibindo ${entries.length} de ${readHistory().length} registros.`);
    this.log('');

    return { entries, historyFile };
  }
}
