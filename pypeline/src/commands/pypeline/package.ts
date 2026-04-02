import { spawnSync } from 'node:child_process';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { BUILD_DIR } from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.package');

export type PypelinePackageResult = {
  success: boolean;
  buildDir: string;
};

export default class PypelinePackage extends SfCommand<PypelinePackageResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<PypelinePackageResult> {
    this.log('Gerando package.xml...');

    const result = spawnSync(
      'sf',
      ['project', 'generate', 'manifest', '--source-dir', BUILD_DIR],
      { stdio: 'inherit', encoding: 'utf8' }
    );

    if (result.status !== 0) {
      this.error('Falha ao gerar package.xml.');
    }

    this.log('package.xml gerado com sucesso.');
    return { success: true, buildDir: BUILD_DIR };
  }
}
