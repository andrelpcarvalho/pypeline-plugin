import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  JOB_ID_FILE,
  LOG_PRD,
  LOG_TRAINING,
  fileExists,
  readFileTrimmed,
  writeFile,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.run');

const ERROR_PATTERN = /error|failed|exception|deploy failed/i;

// ── Helpers ────────────────────────────────────────────────────────────────

function logHasErrors(logPath: string): boolean {
  if (!fs.existsSync(logPath)) return false;
  return fs.readFileSync(logPath, 'utf8').split('\n').some((l) => ERROR_PATTERN.test(l));
}

function extractJobId(logPath: string): string | null {
  if (!fs.existsSync(logPath)) return null;
  for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
    const match = /\b(0Af[0-9A-Za-z]{15})\b/.exec(line);
    if (match) return match[1];
  }
  return null;
}

async function runSubcommand(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('sf', args, { stdio: 'inherit' });
    proc.on('close', (code) => resolve(code ?? 1));
  });
}

export type PypelineRunResult = {
  success: boolean;
  jobId:   string | null;
  baselineUpdated: string | null;
};

export default class PypelineRun extends SfCommand<PypelineRunResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    branch: Flags.string({
      char: 'b',
      summary: messages.getMessage('flags.branch.summary'),
    }),
    'skip-training': Flags.boolean({
      summary: messages.getMessage('flags.skip-training.summary'),
      default: false,
    }),
    'dry-run': Flags.boolean({
      summary: messages.getMessage('flags.dry-run.summary'),
      default: false,
    }),
    'prd-org': Flags.string({
      summary: messages.getMessage('flags.prd-org.summary'),
      default: 'devops',
    }),
    'training-org': Flags.string({
      summary: messages.getMessage('flags.training-org.summary'),
      default: 'treino',
    }),
  };

  public async run(): Promise<PypelineRunResult> {
    const { flags } = await this.parse(PypelineRun);

    if (!fileExists(BASELINE_FILE)) {
      this.error('baseline.txt não encontrado. Abortando.');
    }

    const baselineBackup = readFileTrimmed(BASELINE_FILE);
    this.log(`[INFO] Baseline salvo para rollback: ${baselineBackup}`);

    const rollback = (etapa: string): never => {
      this.log('');
      this.log('╔══════════════════════════════════════════════╗');
      this.log(`║  ERRO NA ETAPA: ${etapa.padEnd(28)}║`);
      this.log(`║  Restaurando baseline → ${baselineBackup.slice(0, 20)}...  ║`);
      this.log('╚══════════════════════════════════════════════╝');
      writeFile(BASELINE_FILE, baselineBackup + '\n');
      this.log('[INFO] Rollback concluído. Nenhuma alteração foi promovida.');
      this.error(`Pipeline abortado na etapa: ${etapa}`);
    };

    // ── ETAPA 1: Build ───────────────────────────────────────────────────
    this.log('');
    this.log('==> [1/4] Executando build...');
    const buildArgs = ['pypeline', 'build', ...(flags['branch'] ? ['--branch', flags['branch']] : []), ...(flags['dry-run'] ? ['--dry-run'] : [])];
    if ((await runSubcommand(buildArgs)) !== 0) rollback('pypeline build');

    // ── ETAPA 2: package.xml ─────────────────────────────────────────────
    this.log('');
    this.log('==> [2/4] Gerando package.xml...');
    if ((await runSubcommand(['pypeline', 'package'])) !== 0) rollback('pypeline package');

    // ── ETAPA 3: Training em background ─────────────────────────────────
    let trainingPromise: Promise<number> | null = null;
    if (!flags['skip-training']) {
      this.log('');
      this.log('==> [3/4] Disparando deploy em Training (paralelo ao PRD)...');
      trainingPromise = runSubcommand(['pypeline', 'deploy', 'training', '--target-org', flags['training-org']]);
      this.log('[INFO] Training rodando em background...');
    } else {
      this.log('==> [3/4] Training ignorado (--skip-training).');
    }

    // ── ETAPA 4: Validação PRD (síncrono) ────────────────────────────────
    this.log('');
    this.log('==> [4/4] Validação em PRD...');
    const prdExit = await runSubcommand(['pypeline', 'validate', 'prd', '--target-org', flags['prd-org']]);

    // Aguarda training antes de avaliar resultados
    const trainingExit = trainingPromise ? await trainingPromise : null;

    if (prdExit !== 0) rollback('pypeline validate prd (exit code diferente de 0)');
    if (logHasErrors(LOG_PRD)) {
      this.log('[ERRO] Erros detectados no deploy_prd_output.log:');
      const lines = fs.readFileSync(LOG_PRD, 'utf8').split('\n');
      let shown = 0;
      for (const l of lines) {
        if (ERROR_PATTERN.test(l)) { this.log(`  ${l}`); if (++shown >= 20) break; }
      }
      rollback('validate PRD (erros encontrados no log)');
    }

    this.log('[OK] Validação em PRD concluída sem erros.');

    // ── Resultado do Training ────────────────────────────────────────────
    this.log('');
    if (trainingExit === null) {
      this.log('[INFO] Training não executado nesta run.');
    } else if (trainingExit !== 0) {
      this.warn(`Training terminou com exit code ${trainingExit} — verifique deploy_training_output.log`);
    } else if (logHasErrors(LOG_TRAINING)) {
      this.warn('Training concluído mas com erros no log — verifique deploy_training_output.log');
    } else {
      this.log('[OK] Deploy em Training concluído sem erros.');
    }

    // ── Atualiza baseline após PRD passar ───────────────────────────────
    const novoBaseline = readFileTrimmed(BASELINE_FILE);
    writeFile(BASELINE_FILE, novoBaseline + '\n');
    this.log(`[INFO] baseline.txt atualizado para: ${novoBaseline}`);

    // ── Job ID para quick deploy ─────────────────────────────────────────
    const jobId = extractJobId(LOG_PRD);
    if (jobId) {
      writeFile(JOB_ID_FILE, jobId + '\n');
      this.log('');
      this.log('╔══════════════════════════════════════════════════════════════╗');
      this.log('║  PIPELINE CONCLUÍDO COM SUCESSO                              ║');
      this.log(`║  Job ID para quick deploy: ${jobId.padEnd(34)}║`);
      this.log('║  Execute: sf pypeline quickdeploy                            ║');
      this.log('╚══════════════════════════════════════════════════════════════╝');
    } else {
      this.warn('Job ID não encontrado no log. Verifique deploy_prd_output.log manualmente.');
      this.log('[INFO] Pipeline concluído. Baseline atualizado.');
    }

    this.log('');
    this.log('Fim da execução.');

    return { success: true, jobId, baselineUpdated: novoBaseline };
  }
}
