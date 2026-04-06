import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.init');

export type InitResult = {
  baselineCreated: boolean;
  gitignoreUpdated: boolean;
  orgsFound: string[];
  orgsMissing: string[];
};

const GITIGNORE_BLOCK = `
# ── pypeline — arquivos gerados pelo pipeline ────────────────────────────────
baseline.txt
build_deploy/
lista_arquivos_adicionados.txt
lista_arquivos_modificados.txt
lista_arquivos_deletados.txt
lista_arquivos_naodeletados.txt
prd_job_id.txt
deploy_prd_output.log
deploy_training_output.log
`;

const PYPELINE_ENTRIES = [
  'baseline.txt',
  'build_deploy/',
  'lista_arquivos_adicionados.txt',
  'lista_arquivos_modificados.txt',
  'lista_arquivos_deletados.txt',
  'lista_arquivos_naodeletados.txt',
  'prd_job_id.txt',
  'deploy_prd_output.log',
  'deploy_training_output.log',
];

const DEFAULT_ORGS = ['devops', 'treino'];

export default class Init extends SfCommand<InitResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<InitResult> {
    const cwd = process.cwd();
    const result: InitResult = {
      baselineCreated: false,
      gitignoreUpdated: false,
      orgsFound: [],
      orgsMissing: [],
    };

    this.log('\n── pypeline init ───────────────────────────────────────────\n');

    // ── 1. baseline.txt ────────────────────────────────────────────────────
    const baselinePath = join(cwd, 'baseline.txt');

    if (existsSync(baselinePath)) {
      const hash = readFileSync(baselinePath, 'utf8').trim();
      this.log(`✔  baseline.txt já existe (${hash.slice(0, 8)}...)`);
    } else {
      const confirm = await this.confirm({
        message: 'baseline.txt não encontrado. Criar agora com o commit HEAD atual?',
        defaultAnswer: true,
      });

      if (confirm) {
        try {
          const hash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd }).trim();
          writeFileSync(baselinePath, hash + '\n', 'utf8');
          result.baselineCreated = true;
          this.log(`✔  baseline.txt criado → ${hash.slice(0, 8)}...`);
        } catch {
          this.warn('Não foi possível obter o commit HEAD. Certifique-se de estar em um repositório git.');
        }
      } else {
        this.log('  baseline.txt ignorado. Crie manualmente com: git rev-parse HEAD > baseline.txt');
      }
    }

    // ── 2. .gitignore ──────────────────────────────────────────────────────
    this.log('');
    const gitignorePath = join(cwd, '.gitignore');

    if (!existsSync(gitignorePath)) {
      const confirm = await this.confirm({
        message: '.gitignore não encontrado. Criar com as entradas do pypeline?',
        defaultAnswer: true,
      });

      if (confirm) {
        writeFileSync(gitignorePath, GITIGNORE_BLOCK.trimStart(), 'utf8');
        result.gitignoreUpdated = true;
        this.log('✔  .gitignore criado com entradas do pypeline.');
      }
    } else {
      const content = readFileSync(gitignorePath, 'utf8');
      const missing = PYPELINE_ENTRIES.filter((entry) => !content.includes(entry));

      if (missing.length === 0) {
        this.log('✔  .gitignore já contém todas as entradas do pypeline.');
      } else {
        this.log(`  Entradas ausentes no .gitignore:\n${missing.map((e) => `    - ${e}`).join('\n')}`);

        const confirm = await this.confirm({
          message: 'Adicionar entradas do pypeline ao .gitignore?',
          defaultAnswer: true,
        });

        if (confirm) {
          appendFileSync(gitignorePath, GITIGNORE_BLOCK, 'utf8');
          result.gitignoreUpdated = true;
          this.log('✔  Entradas adicionadas ao .gitignore.');
        } else {
          this.log('  .gitignore não foi alterado.');
        }
      }
    }

    // ── 3. Orgs autenticadas ───────────────────────────────────────────────
    this.log('');
    this.log('Verificando orgs autenticadas...');

    try {
      const output = execSync('sf org list --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(output);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const nonScratch = (parsed?.result?.nonScratchOrgs ?? []) as Array<{ alias?: string }>;
      const aliases = nonScratch.map((o) => o.alias).filter(Boolean) as string[];

      for (const alias of DEFAULT_ORGS) {
        if (aliases.includes(alias)) {
          result.orgsFound.push(alias);
          this.log(`✔  Org '${alias}' autenticada.`);
        } else {
          result.orgsMissing.push(alias);
          this.warn(`Org '${alias}' não encontrada. Execute: sf org login web --alias ${alias}`);
        }
      }
    } catch {
      this.warn('Não foi possível verificar as orgs. Execute "sf org list" para checar manualmente.');
    }

    // ── Resumo ─────────────────────────────────────────────────────────────
    this.log('\n────────────────────────────────────────────────────────────');

    if (result.orgsMissing.length === 0 && existsSync(baselinePath)) {
      this.log('✔  Workspace pronto. Execute sf pypeline run para iniciar o pipeline.\n');
    } else {
      this.log('  Alguns itens precisam de atenção antes de rodar o pipeline:');
      if (!existsSync(baselinePath)) {
        this.log('    - Crie o baseline.txt: git rev-parse HEAD > baseline.txt');
      }
      for (const alias of result.orgsMissing) {
        this.log(`    - Autentique a org: sf org login web --alias ${alias}`);
      }
      this.log('');
    }

    return result;
  }
}
