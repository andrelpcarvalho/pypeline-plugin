import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  JOB_ID_FILE,
  LOG_PRD,
  SOURCE_DIR,
  unlinkIfExists,
  writeFile,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.validate.prd');

const JOB_ID_REGEX = /\b(0Af[0-9A-Za-z]{15})\b/;

export type PypelineValidatePrdResult = {
  success: boolean;
  jobId:   string | null;
  logPath: string;
};

export default class PypelineValidatePrd extends SfCommand<PypelineValidatePrdResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.string({
      // char 'o' removido — reservado para target-org nativo (sf-plugin/dash-o)
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

    unlinkIfExists(LOG_PRD);
    unlinkIfExists(JOB_ID_FILE);

    this.log('Iniciando validação em PRD...');

    const cmd = [
      'project', 'deploy', 'validate',
      '--source-dir', SOURCE_DIR,
      '--target-org',  flags['target-org'] ?? 'devops',
      '-w',            String(flags['wait'] ?? 240),
      '--verbose',
    ];

    let jobId: string | null = null;

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn('sf', cmd, { stdio: ['inherit', 'pipe', 'pipe'] });
      const log  = fs.createWriteStream(LOG_PRD, { flags: 'a' });

      const handleChunk = (chunk: Buffer, isErr = false): void => {
        const text = chunk.toString();
        (isErr ? process.stderr : process.stdout).write(text);
        log.write(text);

        if (!jobId) {
          for (const line of text.split('\n')) {
            const match = JOB_ID_REGEX.exec(line);
            if (match?.[1]) { jobId = match[1]; break; }
          }
        }
      };

      proc.stdout?.on('data', (c: Buffer) => handleChunk(c));
      proc.stderr?.on('data', (c: Buffer) => handleChunk(c, true));
      proc.on('close', (code) => { log.close(); resolve(code ?? 1); });
    });

    if (exitCode !== 0) {
      this.error(`Validate em PRD falhou com exit code ${exitCode}.`);
    }

    // Atribui a uma const tipada para evitar "never" na concatenação
    if (jobId !== null) {
      const safeJobId: string = jobId;
      writeFile(JOB_ID_FILE, safeJobId + '\n');
      this.log(`[INFO] Job ID salvo em prd_job_id.txt: ${safeJobId}`);
    } else {
      this.warn('Job ID não encontrado no log. Quick deploy deverá ser feito manualmente.');
    }

    this.log('Validação em PRD concluída.');
    return { success: true, jobId, logPath: LOG_PRD };
  }
}
