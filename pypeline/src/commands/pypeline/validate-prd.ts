import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { JOB_ID_FILE, LOG_PRD, SOURCE_DIR, unlinkIfExists, writeFile } from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.validate-prd');

const JOB_ID_REGEX = /\b(0Af[0-9A-Za-z]{15})\b/;

export type PypelineValidatePrdResult = {
  success: boolean;
  jobId: string | null;
  logPath: string;
};

export default class PypelineValidatePrd extends SfCommand<PypelineValidatePrdResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.string({
      summary: messages.getMessage('flags.target-org.summary'),
      default: 'devops',
    }),
    wait: Flags.integer({
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      default: 240,
    }),
  };

  public async run(): Promise<PypelineValidatePrdResult> {
    const { flags } = await this.parse(PypelineValidatePrd);
    const logPath = LOG_PRD();
    const jobIdFile = JOB_ID_FILE();
    const sourceDir = SOURCE_DIR();

    unlinkIfExists(logPath);
    unlinkIfExists(jobIdFile);

    this.log('Iniciando validação em PRD...');

    const cmd = [
      'project', 'deploy', 'validate',
      '--source-dir', sourceDir,
      '--target-org', flags['target-org'] ?? 'devops',
      '-w', String(flags['wait'] ?? 240),
      '--verbose',
    ];

    let jobId: string | null = null;

    const PROGRESS_PATTERNS = [
      /Status:\s/i,
      /components?\s+(deployed|failed|total)/i,
      /tests?\s+(passed|failed|completed|running|errors?)/i,
      /Deploy\s+ID/i,
      /Running\s+Test/i,
      /Deploying\s/i,
      /Waiting\s/i,
      /Error\s/i,
      /FAIL/i,
    ];

    const isProgressLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return PROGRESS_PATTERNS.some((p) => p.test(trimmed));
    };

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn('sf', cmd, { stdio: ['inherit', 'pipe', 'pipe'] });
      const log = fs.createWriteStream(logPath, { flags: 'a' });

      const handleChunk = (chunk: Buffer, isErr = false): void => {
        const text = chunk.toString();
        log.write(text);

        for (const line of text.split('\n')) {
          if (!jobId) {
            const match = JOB_ID_REGEX.exec(line);
            if (match?.[1]) {
              jobId = match[1];
            }
          }

          if (isProgressLine(line)) {
            (isErr ? process.stderr : process.stdout).write(`  [PRD] ${line.trim()}\n`);
          }
        }
      };

      if (proc.stdout)
        proc.stdout.on('data', (c: Buffer) => handleChunk(c));
      if (proc.stderr)
        proc.stderr.on('data', (c: Buffer) => handleChunk(c, true));

      proc.on('close', (code) => { log.close(); resolve(code ?? 1); });
    });

    if (exitCode !== 0) {
      this.log(`[PRD] ✗ Validação falhou (exit code ${exitCode}). Detalhes em ${logPath}`);
      this.error(`Validate em PRD falhou com exit code ${exitCode}.`);
    }

    if (jobId !== null) {
      const safeJobId = jobId as string;
      writeFile(jobIdFile, safeJobId + '\n');
      this.log(`[INFO] Job ID salvo em prd_job_id.txt: ${safeJobId}`);
    } else {
      this.warn('Job ID não encontrado no log. Quick deploy deverá ser feito manualmente.');
    }

    this.log('Validação em PRD concluída.');
    return { success: true, jobId, logPath };
  }
}
