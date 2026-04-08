import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  BUILD_DIR,
  JOB_ID_FILE,
  LOG_PRD,
  LOG_TRAINING,
  LOG_QUICK_DEPLOY,
  PYPELINE_CONFIG_FILE,
  fileExists,
  readFileTrimmed,
  readPypelineConfig,
  gitDiffFiles,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.status');

export type PypelineStatusResult = {
  baseline: string | null;
  branch: string | null;
  pendingChanges: { added: number; modified: number; deleted: number };
  jobId: string | null;
  jobIdExpired: boolean;
  buildDirExists: boolean;
  logsExist: { prd: boolean; training: boolean; quickDeploy: boolean };
  orgsAuthenticated: string[];
};

// O validate-prd gera um Job ID que expira em 10 horas.
// Usamos o mtime do arquivo prd_job_id.txt como referência.
const JOB_ID_TTL_MS = 10 * 60 * 60 * 1000;

function isJobIdExpired(jobIdFilePath: string): boolean {
  try {
    const stat = fs.statSync(jobIdFilePath);
    return Date.now() - stat.mtimeMs > JOB_ID_TTL_MS;
  } catch {
    return true;
  }
}

function getOrgAliases(): string[] {
  try {
    const output = execSync('sf org list --json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(output);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const nonScratch = (parsed?.result?.nonScratchOrgs ?? []) as Array<{ alias?: string }>;
    return nonScratch.map((o) => o.alias).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

export default class PypelineStatus extends SfCommand<PypelineStatusResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<PypelineStatusResult> {
    await this.parse(PypelineStatus);

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║           PYPELINE STATUS                    ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');

    // ── Branch ────────────────────────────────────────────────────────────
    const config = readPypelineConfig();
    const branch = config.branch ?? null;
    this.log(`  Branch default   : ${branch ?? '(não configurada — usando main)'}`);
    this.log(`  Config file      : ${fileExists(PYPELINE_CONFIG_FILE()) ? '✔ .pypeline.json' : '✘ ausente'}`);

    // ── Baseline ──────────────────────────────────────────────────────────
    let baseline: string | null = null;
    if (fileExists(BASELINE_FILE())) {
      baseline = readFileTrimmed(BASELINE_FILE());
      this.log(`  Baseline         : ${baseline.slice(0, 12)}...`);
    } else {
      this.log('  Baseline         : ✘ baseline.txt não encontrado');
    }

    // ── Pending changes ───────────────────────────────────────────────────
    let pendingChanges = { added: 0, modified: 0, deleted: 0 };
    if (baseline) {
      try {
        const diff = gitDiffFiles(baseline);
        pendingChanges = {
          added: diff.added.length,
          modified: diff.modified.length,
          deleted: diff.deleted.length,
        };
        const total = pendingChanges.added + pendingChanges.modified + pendingChanges.deleted;
        this.log(`  Alterações       : ${total} arquivo(s) — +${pendingChanges.added} ~${pendingChanges.modified} -${pendingChanges.deleted}`);
      } catch {
        this.log('  Alterações       : (não foi possível calcular diff)');
      }
    }

    // ── Job ID ────────────────────────────────────────────────────────────
    let jobId: string | null = null;
    let jobIdExpired = false;
    const jobIdFile = JOB_ID_FILE();
    if (fileExists(jobIdFile)) {
      jobId = readFileTrimmed(jobIdFile);
      jobIdExpired = isJobIdExpired(jobIdFile);
      const statusIcon = jobIdExpired ? '⚠ expirado' : '✔ válido';
      this.log(`  Job ID           : ${jobId} (${statusIcon})`);
      if (jobIdExpired) {
        this.warn('O Job ID expirou (>10h). Execute sf pypeline run novamente.');
      }
    } else {
      this.log('  Job ID           : (nenhum — execute sf pypeline run)');
    }

    // ── Build dir ─────────────────────────────────────────────────────────
    const buildDirExists = fs.existsSync(BUILD_DIR());
    this.log(`  Build dir        : ${buildDirExists ? '✔ ' + BUILD_DIR() : '✘ não existe'}`);

    // ── Logs ──────────────────────────────────────────────────────────────
    const logsExist = {
      prd: fileExists(LOG_PRD()),
      training: fileExists(LOG_TRAINING()),
      quickDeploy: fileExists(LOG_QUICK_DEPLOY()),
    };
    const logEntries = [
      logsExist.prd ? '✔ prd' : '✘ prd',
      logsExist.training ? '✔ training' : '✘ training',
      logsExist.quickDeploy ? '✔ quickdeploy' : '✘ quickdeploy',
    ];
    this.log(`  Logs             : ${logEntries.join('  ')}`);

    // ── Orgs ──────────────────────────────────────────────────────────────
    this.log('');
    this.log('  Orgs autenticadas:');
    const orgsAuthenticated = getOrgAliases();
    if (orgsAuthenticated.length === 0) {
      this.log('    (nenhuma org encontrada)');
    } else {
      for (const alias of orgsAuthenticated) {
        this.log(`    ✔ ${alias}`);
      }
    }

    this.log('');

    return {
      baseline,
      branch,
      pendingChanges,
      jobId,
      jobIdExpired,
      buildDirExists,
      logsExist,
      orgsAuthenticated,
    };
  }
}
