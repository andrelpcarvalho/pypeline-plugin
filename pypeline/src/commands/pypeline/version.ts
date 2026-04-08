import { execSync, spawnSync } from 'node:child_process';
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

// Resolve o caminho absoluto do npm — necessário em ambientes App-V/corporativos
// onde o PATH virtualizado não é herdado por subprocessos do sf CLI
function resolveNpm(): string {
  if (platform() !== 'win32') return 'npm';
  try {
    const result = spawnSync('where', ['npm.cmd'], { encoding: 'utf8', shell: 'cmd.exe' });
    const first = result.stdout.split('\n')[0].trim();
    if (first) return first;
  } catch { /* fallback */ }
  return 'npm.cmd';
}

const NPM = resolveNpm();

export default class Version extends SfCommand<VersionResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public run(): Promise<VersionResult> {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pkg = require('../../../package.json');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const current = String(pkg.version);

    let latest: string | null = null;
    let updateAvailable = false;

    try {
      const raw = execSync(`"${NPM}" view pypeline version`, {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      latest = raw.trim();
      updateAvailable = latest !== current;
    } catch {
      // npm inacessível (App-V, proxy, sem internet) — apenas mostra a versão atual
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