import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { input } from '@inquirer/prompts';
import { Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { readPypelineConfig, writePypelineConfig, type PypelineConfig } from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.init');

export type InitResult = {
  baselineCreated: boolean;
  gitignoreUpdated: boolean;
  branchConfigured: string | null;
  orgsFound: string[];
  orgsMissing: string[];
};

const GITIGNORE_BLOCK = `
# ── pypeline — arquivos gerados pelo pipeline ────────────────────────────────
.pypeline.json
baseline.txt
build_deploy/
lista_arquivos_adicionados.txt
lista_arquivos_modificados.txt
lista_arquivos_deletados.txt
lista_arquivos_naodeletados.txt
prd_job_id.txt
deploy_prd_output.log
deploy_training_output.log
quick_deploy_prd_output.log
.pypeline-history.json
commitlist.txt
`;

const PYPELINE_ENTRIES = [
  '.pypeline.json',
  'baseline.txt',
  'build_deploy/',
  'lista_arquivos_adicionados.txt',
  'lista_arquivos_modificados.txt',
  'lista_arquivos_deletados.txt',
  'lista_arquivos_naodeletados.txt',
  'prd_job_id.txt',
  'deploy_prd_output.log',
  'deploy_training_output.log',
  'quick_deploy_prd_output.log',
  '.pypeline-history.json',
  'commitlist.txt',
];

const DEFAULT_ORGS = ['devops', 'treino'];

export default class Init extends SfCommand<InitResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<InitResult> {
    const cwd = process.cwd();
    this.log('\n── pypeline init ───────────────────────────────────────────\n');

    const branchConfigured = await this.setupBranch(cwd);
    this.log('');
    const baselineCreated = await this.setupBaseline(cwd);
    this.log('');
    const gitignoreUpdated = await this.setupGitignore(cwd);
    this.log('');
    const { orgsFound, orgsMissing } = this.checkOrgs();

    this.printSummary(cwd, orgsMissing);

    return { baselineCreated, gitignoreUpdated, branchConfigured, orgsFound, orgsMissing };
  }

  // ── Branch ───────────────────────────────────────────────────────────────

  private async setupBranch(cwd: string): Promise<string> {
    const existingConfig = readPypelineConfig();
    const currentBranch = existingConfig.branch ?? 'main';
    this.log(`Branch default atual: ${currentBranch}`);

    const change = await this.confirm({
      message: `Deseja alterar a branch default? (atual: ${currentBranch})`,
      defaultAnswer: false,
    });

    if (!change) {
      this.log(`✔  Branch default mantida: ${currentBranch}`);
      return currentBranch;
    }

    const suggestion = this.detectActiveBranch(cwd) ?? currentBranch;
    const branch = await input({
      message: 'Nome da branch default:',
      default: suggestion,
      validate: (v: string) => v.trim().length > 0 || 'O nome da branch não pode ser vazio.',
    });

    const trimmed = branch.trim();
    writePypelineConfig({ ...existingConfig, branch: trimmed } as PypelineConfig);
    this.log(`✔  Branch default salva em .pypeline.json → ${trimmed}`);
    return trimmed;
  }

  private detectActiveBranch(cwd: string): string | null {
    try {
      const branches = execSync('git branch -a', { encoding: 'utf8', cwd })
        .split('\n').map((b) => b.replace('*', '').trim()).filter(Boolean);
      if (branches.length > 0) {
        this.log(`  Branches disponíveis:\n${branches.map((b) => `    - ${b}`).join('\n')}`);
      }
      return execSync('git branch --show-current', { encoding: 'utf8', cwd }).trim() || null;
    } catch {
      return null;
    }
  }

  // ── Baseline ─────────────────────────────────────────────────────────────

  private async setupBaseline(cwd: string): Promise<boolean> {
    const baselinePath = join(cwd, 'baseline.txt');

    if (existsSync(baselinePath)) {
      const hash = readFileSync(baselinePath, 'utf8').trim();
      this.log(`✔  baseline.txt já existe (${hash.slice(0, 8)}...)`);
      return false;
    }

    const confirm = await this.confirm({
      message: 'baseline.txt não encontrado. Criar agora com o commit HEAD atual?',
      defaultAnswer: true,
    });

    if (!confirm) {
      this.log('  baseline.txt ignorado. Crie manualmente com: git rev-parse HEAD > baseline.txt');
      return false;
    }

    try {
      const hash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd }).trim();
      writeFileSync(baselinePath, hash + '\n', 'utf8');
      this.log(`✔  baseline.txt criado → ${hash.slice(0, 8)}...`);
      return true;
    } catch {
      this.warn('Não foi possível obter o commit HEAD. Certifique-se de estar em um repositório git.');
      return false;
    }
  }

  // ── .gitignore ────────────────────────────────────────────────────────────

  private async setupGitignore(cwd: string): Promise<boolean> {
    const gitignorePath = join(cwd, '.gitignore');

    if (!existsSync(gitignorePath)) {
      return this.createGitignore(gitignorePath);
    }

    const missing = PYPELINE_ENTRIES.filter((e) => !readFileSync(gitignorePath, 'utf8').includes(e));

    if (missing.length === 0) {
      this.log('✔  .gitignore já contém todas as entradas do pypeline.');
      return false;
    }

    return this.appendGitignore(gitignorePath, missing);
  }

  private async createGitignore(gitignorePath: string): Promise<boolean> {
    const confirm = await this.confirm({
      message: '.gitignore não encontrado. Criar com as entradas do pypeline?',
      defaultAnswer: true,
    });
    if (!confirm) return false;
    writeFileSync(gitignorePath, GITIGNORE_BLOCK.trimStart(), 'utf8');
    this.log('✔  .gitignore criado com entradas do pypeline.');
    return true;
  }

  private async appendGitignore(gitignorePath: string, missing: string[]): Promise<boolean> {
    this.log(`  Entradas ausentes no .gitignore:\n${missing.map((e) => `    - ${e}`).join('\n')}`);
    const confirm = await this.confirm({
      message: 'Adicionar entradas do pypeline ao .gitignore?',
      defaultAnswer: true,
    });
    if (!confirm) {
      this.log('  .gitignore não foi alterado.');
      return false;
    }
    appendFileSync(gitignorePath, GITIGNORE_BLOCK, 'utf8');
    this.log('✔  Entradas adicionadas ao .gitignore.');
    return true;
  }

  // ── Orgs ─────────────────────────────────────────────────────────────────

  private checkOrgs(): { orgsFound: string[]; orgsMissing: string[] } {
    this.log('Verificando orgs autenticadas...');
    const orgsFound: string[] = [];
    const orgsMissing: string[] = [];

    try {
      const output = execSync('sf org list --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(output);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const nonScratch = (parsed?.result?.nonScratchOrgs ?? []) as Array<{ alias?: string }>;
      const aliases = nonScratch.map((o) => o.alias).filter(Boolean) as string[];

      for (const alias of DEFAULT_ORGS) {
        if (aliases.includes(alias)) {
          orgsFound.push(alias);
          this.log(`✔  Org '${alias}' autenticada.`);
        } else {
          orgsMissing.push(alias);
          this.warn(`Org '${alias}' não encontrada. Execute: sf org login web --alias ${alias}`);
        }
      }
    } catch {
      this.warn('Não foi possível verificar as orgs. Execute "sf org list" para checar manualmente.');
    }

    return { orgsFound, orgsMissing };
  }

  // ── Resumo ────────────────────────────────────────────────────────────────

  private printSummary(cwd: string, orgsMissing: string[]): void {
    this.log('\n────────────────────────────────────────────────────────────');
    const baselineOk = existsSync(join(cwd, 'baseline.txt'));

    if (orgsMissing.length === 0 && baselineOk) {
      this.log('✔  Workspace pronto. Execute sf pypeline run para iniciar o pipeline.\n');
      return;
    }

    this.log('  Alguns itens precisam de atenção antes de rodar o pipeline:');
    if (!baselineOk) this.log('    - Crie o baseline.txt: git rev-parse HEAD > baseline.txt');
    for (const alias of orgsMissing) {
      this.log(`    - Autentique a org: sf org login web --alias ${alias}`);
    }
    this.log('');
  }
}
