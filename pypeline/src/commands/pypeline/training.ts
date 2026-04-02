import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { LOG_TRAINING, SOURCE_DIR, unlinkIfExists } from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.deploy.training');

export type PypelineDeployTrainingResult = {
  success: boolean;
  logPath: string;
};

export default class PypelineDeployTraining extends SfCommand<PypelineDeployTrainingResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.string({
      // char 'o' removido — reservado para target-org nativo (sf-plugin/dash-o)
      summary: messages.getMessage('flags.target-org.summary'),
      default: 'treino',
    }),
    wait: Flags.integer({
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      default: 240,
    }),
  };

  public async run(): Promise<PypelineDeployTrainingResult> {
    const { flags } = await this.parse(PypelineDeployTraining);

    unlinkIfExists(LOG_TRAINING);
    this.log('Iniciando deploy em Training...');

    const cmd = [
      'project', 'deploy', 'start',
      '--source-dir', SOURCE_DIR,
      '--target-org',  flags['target-org'] ?? 'treino',
      '--test-level',  'RunLocalTests',
      '-w',            String(flags['wait'] ?? 240),
      '--ignore-conflicts',
      '--verbose',
    ];

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn('sf', cmd, { stdio: ['inherit', 'pipe', 'pipe'] });
      const log  = fs.createWriteStream(LOG_TRAINING, { flags: 'a' });

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        process.stdout.write(text);
        log.write(text);
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        process.stderr.write(text);
        log.write(text);
      });
      proc.on('close', (code) => {
        log.close();
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) {
      this.error(`Deploy em Training falhou com exit code ${exitCode}.`);
    }

    this.log('Deploy em Training concluído com sucesso.');
    return { success: true, logPath: LOG_TRAINING };
  }
}
