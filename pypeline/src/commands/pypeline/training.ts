import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { LOG_TRAINING, SOURCE_DIR, unlinkIfExists } from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.training');

export type PypelineTrainingResult = {
  success: boolean;
  logPath: string;
};

export default class PypelineTraining extends SfCommand<PypelineTrainingResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.string({
      summary: messages.getMessage('flags.target-org.summary'),
      default: 'treino',
    }),
    wait: Flags.integer({
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      default: 240,
    }),
  };

  public async run(): Promise<PypelineTrainingResult> {
    const { flags } = await this.parse(PypelineTraining);
    const logPath = LOG_TRAINING();
    const sourceDir = SOURCE_DIR();

    unlinkIfExists(logPath);

    this.log('Iniciando deploy em Training...');

    const cmd = [
      'project', 'deploy', 'start',
      '--source-dir', sourceDir,
      '--target-org', flags['target-org'] ?? 'treino',
      '--test-level', 'RunLocalTests',
      '-w', String(flags['wait'] ?? 240),
      '--ignore-conflicts',
      '--verbose',
    ];

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn('sf', cmd, { stdio: ['inherit', 'pipe', 'pipe'] });
      const log = fs.createWriteStream(logPath, { flags: 'a' });

      if (proc.stdout)
        proc.stdout.on('data', (chunk: Buffer) => {
          log.write(chunk);
        });

      if (proc.stderr)
        proc.stderr.on('data', (chunk: Buffer) => {
          log.write(chunk);
        });

      proc.on('close', (code) => { log.close(); resolve(code ?? 1); });
    });

    if (exitCode !== 0) {
      this.log(`[TRAINING] ✗ Deploy falhou (exit code ${exitCode}). Detalhes em ${logPath}`);
      this.error(`Deploy em Training falhou com exit code ${exitCode}.`);
    }

    this.log(`[TRAINING] ✓ Deploy concluído com sucesso. Log: ${logPath}`);
    return { success: true, logPath };
  }
}
