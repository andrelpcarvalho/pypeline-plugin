import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  JOB_ID_FILE,
  LOG_PRD,
  LOG_TRAINING,
  SCRIPT_DIR,
  fileExists,
  readFileTrimmed,
  writeFile,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.run');

// ── Melhoria 4: regex específico para Status : Failed do sf CLI ────────────
const DEPLOY_FAILED_PATTERN = /Status\s*:\s*Failed/i;

function logHasErrors(logPath: string): boolean {
  if (!fs.existsSync(logPath)) return false;
  return fs.readFileSync(logPath, 'utf8').split('\n').some((l) => DEPLOY_FAILED_PATTERN.test(l));
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
    const proc: ChildProcess = spawn('sf', args, { stdio: 'inherit' });
    proc.on('close', (code: number | null) => resolve(code ?? 1));
  });
}

export type PypelineRunResult = {
  success:         boolean;
  jobId:           string | null;
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
    // ── Melhoria 3: training é opt-in, não opt-out ─────────────────────────
    // Por padrão o training NÃO roda. Passe --training para habilitá-lo.
    training: Flags.boolean({
      summary: messages.getMessage('flags.training.summary'),
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

    const baselineFile = BASELINE_FILE();
    const jobIdFile    = JOB_ID_FILE();
    const logPrd       = LOG_PRD();
    const logTraining  = LOG_TRAINING();

    if (!fileExists(baselineFile)) {
      this.error('baseline.txt não encontrado. Abortando.');
    }

    const baselineBackup = readFileTrimmed(baselineFile);
    this.log(`[INFO] Baseline salvo para rollback : ${baselineBackup}`);
    this.log(`[INFO] Diretório de trabalho        : ${process.cwd()}`);
    this.log(`[INFO] Script dir                   : ${SCRIPT_DIR}`);

    const rollback = (etapa: string): never => {
      this.log('');
      this.log('╔══════════════════════════════════════════════╗');
      this.log(`║  ERRO NA ETAPA: ${etapa.padEnd(28)}║`);
      this.log(`║  Restaurando baseline → ${baselineBackup.slice(0, 20)}...  ║`);
      this.log('╚══════════════════════════════════════════════╝');
      writeFile(baselineFile, baselineBackup + '\n');
      this.log('[INFO] Rollback concluído. Nenhuma alteração foi promovida.');
      this.error(`Pipeline abortado na etapa: ${etapa}`);
    };

    // ── ETAPA 1: Build ───────────────────────────────────────────────────
    this.log('');
    this.log('==> [1/4] Executando build...');
    const buildArgs = [
      'pypeline', 'build',
      ...(flags['branch'] ? ['--branch', flags['branch']] : []),
      ...(flags['dry-run'] ? ['--dry-run'] : []),
    ];
    if ((await runSubcommand(buildArgs)) !== 0) rollback('pypeline build');

    // ── Melhoria 2: lê o novoBaseline calculado pelo build ────────────────
    // O build.ts salva o HEAD atual em PYPELINE_NOVO_BASELINE.
    // Se por algum motivo a env não estiver disponível (subprocesso separado),
    // faz fallback lendo o git rev-parse HEAD diretamente.
    const novoBaseline = process.env['PYPELINE_NOVO_BASELINE'] ?? readFileTrimmed(baselineFile);
    this.log(`[INFO] Novo baseline a ser gravado  : ${novoBaseline}`);

    // ── ETAPA 2: package.xml ─────────────────────────────────────────────
    this.log('');
    this.log('==> [2/4] Gerando package.xml...');
    if ((await runSubcommand(['pypeline', 'package'])) !== 0) rollback('pypeline package');

    // ── ETAPA 3: Training (opt-in via --training) ────────────────────────
    let trainingPromise: Promise<number> | null = null;
    if (flags['training']) {
      this.log('');
      this.log('==> [3/4] Disparando deploy em Training (paralelo ao PRD)...');
      trainingPromise = runSubcommand([
        'pypeline', 'deploy', 'training',
        '--target-org', flags['training-org'] ?? 'treino',
      ]);
      this.log('[INFO] Training rodando em background...');
    } else {
      this.log('');
      this.log('==> [3/4] Training ignorado (use --training para habilitar).');
    }

    // ── ETAPA 4: Validação PRD (síncrono) ────────────────────────────────
    this.log('');
    this.log('==> [4/4] Validação em PRD...');
    const prdExit = await runSubcommand([
      'pypeline', 'validate', 'prd',
      '--target-org', flags['prd-org'] ?? 'devops',
    ]);

    const trainingExit = trainingPromise ? await trainingPromise : null;

    if (prdExit !== 0) rollback('pypeline validate prd (exit code diferente de 0)');

    // ── Melhoria 4: detecta "Status : Failed" no log ─────────────────────
    if (logHasErrors(logPrd)) {
      this.log('[ERRO] Status : Failed detectado no deploy_prd_output.log:');
      let shown = 0;
      for (const l of fs.readFileSync(logPrd, 'utf8').split('\n')) {
        if (DEPLOY_FAILED_PATTERN.test(l)) { this.log(`  ${l}`); if (++shown >= 20) break; }
      }
      rollback('validate PRD (Status : Failed encontrado no log)');
    }

    this.log('[OK] Validação em PRD concluída sem erros.');

    // ── Resultado do Training ────────────────────────────────────────────
    this.log('');
    if (trainingExit === null) {
      this.log('[INFO] Training não executado nesta run (use --training para habilitar).');
    } else if (trainingExit !== 0) {
      this.warn(`Training terminou com exit code ${trainingExit} — verifique deploy_training_output.log`);
    } else if (logHasErrors(logTraining)) {
      this.warn('Training concluído mas com Status : Failed no log — verifique deploy_training_output.log');
    } else {
      this.log('[OK] Deploy em Training concluído sem erros.');
    }

    // ── Melhoria 2: grava o novoBaseline correto (HEAD do git pull) ───────
    writeFile(baselineFile, novoBaseline + '\n');
    this.log(`[INFO] baseline.txt atualizado para: ${novoBaseline}`);

    // ── Job ID para quick deploy ─────────────────────────────────────────
    const jobId = extractJobId(logPrd);
    if (jobId) {
      writeFile(jobIdFile, jobId + '\n');
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
