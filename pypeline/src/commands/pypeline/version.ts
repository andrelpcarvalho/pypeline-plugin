import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import { Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.version');

export type VersionResult = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
};

// No Windows o executável é npm.cmd — no Unix é npm
const NPM = platform() === 'win32' ? 'npm.cmd' : 'npm';

export default class Version extends SfCommand<VersionResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public run(): Promise<VersionResult> {
    // package.json fica na raiz do plugin (3 níveis acima de lib/commands/pypeline/)
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pkg = require('../../../package.json');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const current = String(pkg.version);

    let latest: string | null = null;
    let updateAvailable = false;

    try {
      const raw = execSync(`${NPM} view pypeline version`, {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      latest = raw.trim();
      updateAvailable = latest !== current;
    } catch {
      // sem internet, npm indisponível ou proxy bloqueando — apenas mostra a versão atual
    }

    this.log(`pypeline/${current} (current)`);

    if (updateAvailable && latest) {
      this.warn(
        `pypeline update available from ${current} to ${latest}.\nRun sf plugins update pypeline to update.`
      );
    } else if (latest) {
      this.log('\nYou are running the latest version.');
    }

    return Promise.resolve({ current, latest, updateAvailable });
  }
}