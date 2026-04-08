import { execSync } from 'node:child_process';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  fileExists,
  readFileTrimmed,
  writeFile,
} from '../../config.js';
import { readHistory, appendHistoryEntry, type HistoryEntry } from './history.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.rollback');

export type PypelineRollbackResult = {
  success: boolean;
  previousBaseline: string;
  newBaseline: string;
};

export default class PypelineRollback extends SfCommand<PypelineRollbackResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-hash': Flags.string({
      char: 't',
      summary: messages.getMessage('flags.target-hash.summary'),
    }),
    steps: Flags.integer({
      char: 's',
      summary: messages.getMessage('flags.steps.summary'),
      default: 1,
    }),
    'no-prompt': Flags.boolean({
      summary: messages.getMessage('flags.no-prompt.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineRollbackResult> {
    const { flags } = await this.parse(PypelineRollback);
    const baselineFile = BASELINE_FILE();

    if (!fileExists(baselineFile)) {
      this.error('baseline.txt não encontrado. Nada para reverter.');
    }

    const currentBaseline = readFileTrimmed(baselineFile);

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║           PYPELINE ROLLBACK                  ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  Baseline atual: ${currentBaseline.slice(0, 12)}...`);

    let targetHash: string;

    // ── Modo 1: hash explícito ────────────────────────────────────────
    if (flags['target-hash']) {
      targetHash = flags['target-hash'];
    }
    // ── Modo 2: N passos atrás no histórico ──────────────────────────
    else {
      const history = readHistory();
      const successfulRuns = history
        .filter((e) => e.success && (e.action === 'run' || e.action === 'quickdeploy'))
        .reverse(); // mais recente primeiro

      const steps = flags['steps'] ?? 1;

      if (successfulRuns.length < steps) {
        this.log('');
        this.log('  Histórico de deploys com sucesso:');
        if (successfulRuns.length === 0) {
          this.log('    (nenhum registro)');
          this.log('');
          this.error(
            'Sem histórico suficiente. Use --target-hash para especificar o commit.\n' +
            'Dica: git log --oneline para encontrar o commit desejado.'
          );
        }
        for (const entry of successfulRuns.slice(0, 10)) {
          const date = entry.timestamp.replace('T', ' ').slice(0, 19);
          this.log(`    ${date}  ${entry.baselineFrom.slice(0, 8)} → ${entry.baselineTo.slice(0, 8)}`);
        }
        this.log('');
        this.error(`Pedido ${steps} passo(s) atrás, mas só há ${successfulRuns.length} deploy(s) no histórico.`);
      }

      // steps=1 → volta para o baseline ANTES do último deploy
      targetHash = successfulRuns[steps - 1].baselineFrom;
    }

    // ── Validação do hash ─────────────────────────────────────────────
    try {
      // Resolve hash parciais e validar existência
      targetHash = execSync(`git rev-parse ${targetHash}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch {
      this.error(`Commit não encontrado: ${targetHash}`);
    }

    if (targetHash === currentBaseline) {
      this.log(`\n  O baseline já está em ${targetHash.slice(0, 12)}... Nada a fazer.`);
      return { success: true, previousBaseline: currentBaseline, newBaseline: targetHash };
    }

    this.log(`  Novo baseline : ${targetHash.slice(0, 12)}...`);
    this.log('');

    // ── Confirmação ───────────────────────────────────────────────────
    if (!flags['no-prompt']) {
      this.warn('Isso NÃO desfaz o deploy em produção — apenas altera a referência do baseline.');
      this.warn('O próximo sf pypeline run usará este commit como ponto de partida.');
      this.log('');
      const confirmed = await this.confirm({
        message: `Reverter baseline de ${currentBaseline.slice(0, 8)}... para ${targetHash.slice(0, 8)}...?`,
      });
      if (!confirmed) {
        this.log('[CANCELADO] Baseline não alterado.');
        return { success: false, previousBaseline: currentBaseline, newBaseline: currentBaseline };
      }
    }

    // ── Aplicar ───────────────────────────────────────────────────────
    writeFile(baselineFile, targetHash + '\n');
    this.log(`✔ baseline.txt atualizado para ${targetHash.slice(0, 12)}...`);

    // ── Registrar no histórico ────────────────────────────────────────
    const entry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      action: 'rollback',
      success: true,
      baselineFrom: currentBaseline,
      baselineTo: targetHash,
      jobId: null,
      branch: null,
      filesDeployed: 0,
      targetOrg: undefined,
    };
    appendHistoryEntry(entry);

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║  ROLLBACK CONCLUÍDO                          ║');
    this.log(`║  ${currentBaseline.slice(0, 10)} → ${targetHash.slice(0, 10)}`.padEnd(47) + '║');
    this.log('║  Execute sf pypeline run para o novo deploy. ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');

    return { success: true, previousBaseline: currentBaseline, newBaseline: targetHash };
  }
}
