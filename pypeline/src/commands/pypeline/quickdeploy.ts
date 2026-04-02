import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  JOB_ID_FILE,
  LOG_QUICK_DEPLOY,
  fileExists,
  readFileTrimmed,
  unlinkIfExists,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.quickdeploy');

const JOB_ID_FORMAT = /^0Af[0-9A-Za-z]{15}$/;
const ERROR_PATTERN = /deploy failed|error|exception/i;

export type PypelineQuickdeployResult = {
  success: boolean;
  jobId:   string;
  logPath: string;
};

export default class PypelineQuickdeploy extends SfCommand<PypelineQuickdeployResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.string({
      summary: messages.getMessage('flags.target-org.summary'),
      default: 'devops',
    }),
    'job-id': Flags.string({
      char: 'j',
      summary: messages.getMessage('flags.job-id.summary'),
    }),
    wait: Flags.integer({
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      default: 240,
    }),
    'no-prompt': Flags.boolean({
      summary: messages.getMessage('flags.no-prompt.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineQuickdeployResult> {
    const { flags } = await this.parse(PypelineQuickdeploy);
    const jobIdFile = JOB_ID_FILE();
    const logPath   = LOG_QUICK_DEPLOY();

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║         QUICK DEPLOY EM PRODUÇÃO             ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');

    let jobId = flags['job-id'];
    if (!jobId) {
      if (!fileExists(jobIdFile)) {
        this.error('prd_job_id.txt não encontrado. Execute sf pypeline run (ou sf pypeline validate prd) antes.');
      }
      jobId = readFileTrimmed(jobIdFile);
    }

    if (!jobId) this.error('Job ID vazio. Nenhum Job ID disponível.');

    if (!JOB_ID_FORMAT.test(jobId)) {
      this.error(`Job ID com formato inválido: ${jobId}\nEsperado: 18 caracteres começando com 0Af`);
    }

    this.log(`[INFO] Job ID: ${jobId}`);
    this.log('[INFO] Validate expira em 10 horas após a geração.');
    this.log('');
    this.log(`  Org alvo : ${flags['target-org'] ?? 'devops'}`);
    this.log(`  Job ID   : ${jobId}`);
    this.log('');

    if (!flags['no-prompt']) {
      const confirmed = await this.confirm({ message: 'Confirma o quick deploy em PRODUÇÃO?' });
      if (!confirmed) {
        this.log('[CANCELADO] Quick deploy não executado.');
        return { success: false, jobId, logPath };
      }
    }

    unlinkIfExists(logPath);
    this.log('[INFO] Iniciando quick deploy em PRD...');

    const cmd = [
      'project', 'deploy', 'quick',
      '--job-id',     jobId,
      '--target-org', flags['target-org'] ?? 'devops',
      '-w',           String(flags['wait'] ?? 240),
      '--verbose',
    ];

    const exitCode = await new Promise<number>((resolve) => {
      const proc: ChildProcess = spawn('sf', cmd, { stdio: ['inherit', 'pipe', 'pipe'] });
      const log  = fs.createWriteStream(logPath, { flags: 'a' });

      const handle = (chunk: Buffer, isErr = false): void => {
        const text = chunk.toString();
        (isErr ? process.stderr : process.stdout).write(text);
        log.write(text);
      };

      if (proc.stdout) proc.stdout.on('data', (c: Buffer) => handle(c));
      if (proc.stderr) proc.stderr.on('data', (c: Buffer) => handle(c, true));
      proc.on('close', (code: number | null) => { log.close(); resolve(code ?? 1); });
    });

    this.log('');

    if (exitCode === 0) {
      const logContent = fs.readFileSync(logPath, 'utf8');
      if (ERROR_PATTERN.test(logContent)) {
        this.log('╔══════════════════════════════════════════════╗');
        this.log('║  [AVISO] Deploy concluído com warnings.      ║');
        this.log(`║  Verifique : ${logPath.split('/').pop()?.padEnd(32) ?? ''}║`);
        this.log('╚══════════════════════════════════════════════╝');
      } else {
        unlinkIfExists(jobIdFile);
        this.log('╔══════════════════════════════════════════════╗');
        this.log('║  QUICK DEPLOY EM PRD CONCLUÍDO COM SUCESSO   ║');
        this.log('║  prd_job_id.txt removido (evita reuso)       ║');
        this.log('╚══════════════════════════════════════════════╝');
      }
      return { success: true, jobId, logPath };
    }

    this.log('╔══════════════════════════════════════════════╗');
    this.log('║  [ERRO] Quick deploy falhou.                 ║');
    this.log(`║  Exit code : ${String(exitCode).padEnd(32)}║`);
    this.log(`║  Verifique : ${logPath.split('/').pop()?.padEnd(32) ?? ''}║`);
    this.log('╚══════════════════════════════════════════════╝');
    this.error(`Quick deploy falhou com exit code ${exitCode}.`);
  }
}
