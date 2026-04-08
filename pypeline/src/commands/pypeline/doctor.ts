import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  PYPELINE_CONFIG_FILE,
  fileExists,
  readFileTrimmed,
  readPypelineConfig,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.doctor');

type CheckResult = {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;
};

export type PypelineDoctorResult = {
  checks: CheckResult[];
  passed: number;
  warnings: number;
  failed: number;
};

// ── Standalone check functions (no `this` needed) ─────────────────────────

function checkGitRepo(): CheckResult {
  try {
    execSync('git rev-parse --is-inside-work-tree', { encoding: 'utf8', stdio: 'pipe' });
    return { name: 'Git repository', status: 'pass', message: 'Diretório é um repositório git.' };
  } catch {
    return {
      name: 'Git repository',
      status: 'fail',
      message: 'Não é um repositório git.',
      fix: 'Execute git init ou navegue para o diretório correto.',
    };
  }
}

function checkGitClean(): CheckResult {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (status.length === 0) {
      return { name: 'Git status', status: 'pass', message: 'Working tree limpa.' };
    }
    const count = status.split('\n').length;
    return {
      name: 'Git status',
      status: 'warn',
      message: `${count} arquivo(s) com alterações não commitadas.`,
      fix: 'Commit ou stash as alterações pendentes antes do build.',
    };
  } catch {
    return { name: 'Git status', status: 'warn', message: 'Não foi possível verificar.' };
  }
}

function checkSfCli(): CheckResult {
  try {
    const version = execSync('sf --version', { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0];
    return { name: 'SF CLI', status: 'pass', message: version };
  } catch {
    return {
      name: 'SF CLI',
      status: 'fail',
      message: 'sf CLI não encontrado.',
      fix: 'Instale com: npm install -g @salesforce/cli',
    };
  }
}

function checkNodeVersion(): CheckResult {
  try {
    const version = execSync('node --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const major = parseInt(version.replace('v', '').split('.')[0], 10);
    if (major >= 18) {
      return { name: 'Node.js', status: 'pass', message: version };
    }
    return {
      name: 'Node.js',
      status: 'warn',
      message: `${version} — recomendado v18+.`,
      fix: 'Atualize o Node.js para v18 ou superior.',
    };
  } catch {
    return { name: 'Node.js', status: 'fail', message: 'Node.js não encontrado.' };
  }
}

function checkBaseline(): CheckResult {
  if (!fileExists(BASELINE_FILE())) {
    return {
      name: 'baseline.txt',
      status: 'fail',
      message: 'Arquivo não encontrado.',
      fix: 'Execute sf pypeline init ou: git rev-parse HEAD > baseline.txt',
    };
  }
  const hash = readFileTrimmed(BASELINE_FILE());
  if (!/^[0-9a-f]{40}$/i.test(hash)) {
    return {
      name: 'baseline.txt',
      status: 'fail',
      message: `Conteúdo inválido: "${hash.slice(0, 20)}..."`,
      fix: 'Corrija com: git rev-parse HEAD > baseline.txt',
    };
  }
  try {
    execSync(`git cat-file -t ${hash}`, { encoding: 'utf8', stdio: 'pipe' });
    return { name: 'baseline.txt', status: 'pass', message: `${hash.slice(0, 12)}... (commit válido)` };
  } catch {
    return {
      name: 'baseline.txt',
      status: 'fail',
      message: `${hash.slice(0, 12)}... (commit não existe no repositório)`,
      fix: 'Atualize o baseline: git rev-parse HEAD > baseline.txt',
    };
  }
}

function checkConfig(): CheckResult {
  if (!fileExists(PYPELINE_CONFIG_FILE())) {
    return {
      name: '.pypeline.json',
      status: 'warn',
      message: 'Arquivo não encontrado. Usando defaults.',
      fix: 'Execute sf pypeline init para criar.',
    };
  }
  try {
    const config = readPypelineConfig();
    const branch = config.branch ?? '(não definida)';
    return { name: '.pypeline.json', status: 'pass', message: `branch: ${branch}` };
  } catch {
    return {
      name: '.pypeline.json',
      status: 'fail',
      message: 'JSON inválido.',
      fix: 'Corrija o arquivo ou delete e execute sf pypeline init.',
    };
  }
}

function checkSfdxProject(): CheckResult {
  const sfdxPath = join(process.cwd(), 'sfdx-project.json');
  if (!fs.existsSync(sfdxPath)) {
    return {
      name: 'sfdx-project.json',
      status: 'fail',
      message: 'Não encontrado. Este não parece ser um projeto Salesforce.',
      fix: 'Navegue para a raiz do projeto Salesforce.',
    };
  }
  return { name: 'sfdx-project.json', status: 'pass', message: 'Encontrado.' };
}

function checkGitignore(): CheckResult {
  const gitignorePath = join(process.cwd(), '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return {
      name: '.gitignore',
      status: 'warn',
      message: 'Não encontrado.',
      fix: 'Execute sf pypeline init para criar.',
    };
  }
  const content = fs.readFileSync(gitignorePath, 'utf8');
  const required = ['baseline.txt', 'build_deploy/', '.pypeline.json'];
  const missing = required.filter((e) => !content.includes(e));
  if (missing.length > 0) {
    return {
      name: '.gitignore',
      status: 'warn',
      message: `Entradas ausentes: ${missing.join(', ')}`,
      fix: 'Execute sf pypeline init para adicionar.',
    };
  }
  return { name: '.gitignore', status: 'pass', message: 'Entradas do pypeline presentes.' };
}

function checkOrgs(): CheckResult[] {
  const results: CheckResult[] = [];
  try {
    const output = execSync('sf org list --json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(output);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const nonScratch = (parsed?.result?.nonScratchOrgs ?? []) as Array<{ alias?: string }>;
    const aliases = nonScratch.map((o) => o.alias).filter(Boolean) as string[];

    for (const expected of ['devops', 'treino']) {
      if (aliases.includes(expected)) {
        results.push({ name: `Org '${expected}'`, status: 'pass', message: 'Autenticada.' });
      } else {
        results.push({
          name: `Org '${expected}'`,
          status: 'fail',
          message: 'Não encontrada.',
          fix: `sf org login web --alias ${expected}`,
        });
      }
    }
  } catch {
    results.push({
      name: 'Orgs',
      status: 'warn',
      message: 'Não foi possível verificar.',
      fix: 'Execute sf org list para checar manualmente.',
    });
  }
  return results;
}

// ── Command ───────────────────────────────────────────────────────────────

export default class PypelineDoctor extends SfCommand<PypelineDoctorResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<PypelineDoctorResult> {
    await this.parse(PypelineDoctor);

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║           PYPELINE DOCTOR                    ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log('  Executando diagnóstico do workspace...');
    this.log('');

    const checks: CheckResult[] = [
      checkGitRepo(),
      checkGitClean(),
      checkSfCli(),
      checkNodeVersion(),
      checkBaseline(),
      checkConfig(),
      checkSfdxProject(),
      checkGitignore(),
      ...checkOrgs(),
    ];

    const ICONS: Record<string, string> = { pass: '✔', warn: '⚠', fail: '✘' };
    const COLORS: Record<string, string> = { pass: '\x1b[32m', warn: '\x1b[33m', fail: '\x1b[31m' };
    const RESET = '\x1b[0m';

    for (const check of checks) {
      const icon  = ICONS[check.status] ?? '?';
      const color = COLORS[check.status] ?? '';
      this.log(`  ${color}${icon}${RESET} ${check.name}: ${check.message}`);
      if (check.fix) {
        this.log(`    → ${check.fix}`);
      }
    }

    const passed   = checks.filter((c) => c.status === 'pass').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;
    const failed   = checks.filter((c) => c.status === 'fail').length;

    this.log('');
    this.log('────────────────────────────────────────────────');
    this.log(`  ${passed} passed  ${warnings} warnings  ${failed} failed`);
    this.log('');

    if (failed === 0 && warnings === 0) {
      this.log('  ✔ Workspace saudável! Pronto para sf pypeline run.');
    } else if (failed === 0) {
      this.log('  ⚠ Workspace funcional com avisos. Revise os itens acima.');
    } else {
      this.log('  ✘ Problemas encontrados. Corrija os itens acima antes de continuar.');
    }
    this.log('');

    return { checks, passed, warnings, failed };
  }
}
