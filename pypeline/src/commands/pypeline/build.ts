import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  BRANCH,
  BUILD_DIR,
  PROJECT_DIR,
  PROJECT_NAME,
  SCRIPT_DIR,
  fileExists,
  readFileTrimmed,
  writeFile,
  gitDiffFiles,
} from '../../config.js';
import { copyFile } from '../../fileUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.build');

export type PypelineBuildResult = {
  commitHash: string;
  novoBaseline: string;
  added: string[];
  modified: string[];
  deleted: string[];
};

export default class PypelineBuild extends SfCommand<PypelineBuildResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    branch: Flags.string({
      char: 'b',
      summary: messages.getMessage('flags.branch.summary'),
      default: BRANCH,
    }),
    'dry-run': Flags.boolean({
      summary: messages.getMessage('flags.dry-run.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineBuildResult> {
    const { flags } = await this.parse(PypelineBuild);
    const branch = flags['branch'];
    const dryRun = flags['dry-run'];

    this.log(`SCRIPT_DIR  : ${SCRIPT_DIR}`);
    this.log(`PROJECT_DIR : ${PROJECT_DIR()}`);

    if (!dryRun) {
      const gen = spawnSync('sf', ['project', 'generate', '--name', PROJECT_NAME, '--output-dir', PROJECT_DIR()], {
        encoding: 'utf8',
        stdio: 'inherit',
      });
      if (gen.status !== 0) this.error('Falha ao gerar estrutura do projeto sf.');
    }

    if (!fileExists(BASELINE_FILE())) this.error('baseline.txt não encontrado!');
    const commitHash = readFileTrimmed(BASELINE_FILE());
    this.log(`Baseline : ${commitHash}`);

    if (!dryRun) {
      for (const cmd of [
        ['git', 'checkout', branch ?? BRANCH],
        ['git', 'fetch'],
        ['git', 'pull'],
      ]) {
        const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
        if (r.status !== 0) this.error(`Falha ao executar: ${cmd.join(' ')}`);
      }
    }

    const commits = execSync(`git rev-list ${commitHash}..HEAD --oneline`, { encoding: 'utf8' });
    writeFile(path.join(PROJECT_DIR(), 'commitlist.txt'), commits);

    if (fs.existsSync(BUILD_DIR())) fs.rmSync(BUILD_DIR(), { recursive: true, force: true });
    fs.mkdirSync(BUILD_DIR(), { recursive: true });

    const diff = gitDiffFiles(commitHash);

    writeFile(path.join(PROJECT_DIR(), 'lista_arquivos_naodeletados.txt'), diff.notDeleted.join('\n'));
    writeFile(path.join(PROJECT_DIR(), 'lista_arquivos_deletados.txt'),    diff.deleted.join('\n'));
    writeFile(path.join(PROJECT_DIR(), 'lista_arquivos_adicionados.txt'),  diff.added.join('\n'));
    writeFile(path.join(PROJECT_DIR(), 'lista_arquivos_modificados.txt'),  diff.modified.join('\n'));

    this.log('Arquivos modificados ou adicionados:');
    for (const file of diff.notDeleted) {
      this.log(`  Arquivo a ser avaliado: ${file}`);
      if (!dryRun) {
        try {
          copyFile(file, BUILD_DIR());
        } catch (err) {
          this.warn(`Erro ao copiar '${file}': ${(err as Error).message}`);
        }
      }
    }

    const novoBaseline = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    this.log(`[INFO] Novo baseline calculado: ${novoBaseline}`);
    this.log('[INFO] baseline.txt será atualizado pelo comando run após validate PRD.');

    process.env['NOVO_BASELINE'] = novoBaseline;

    const branchInfo = execSync('git branch', { encoding: 'utf8' });
    this.log(`Branches:\n${branchInfo}`);
    this.log(`Build project criado em ${BUILD_DIR()}.`);

    return { commitHash, novoBaseline, added: diff.added, modified: diff.modified, deleted: diff.deleted };
  }
}
