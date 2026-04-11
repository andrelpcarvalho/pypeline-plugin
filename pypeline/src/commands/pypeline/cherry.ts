import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  BRANCH,
  BUILD_DIR,
  PROJECT_DIR,
  fileExists,
  readFileTrimmed,
  writeFile,
} from '../../config.js';
import { copyFile } from '../../fileUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.cherry');

// ── Tipos ─────────────────────────────────────────────────────────────────

type GmudCommit = {
  hash: string;
  subject: string;
};

type GmudInfo = {
  id: string;
  tagName: string;
  tagCommit: string;
  date: string;
  author: string;
  commits: GmudCommit[];
  files: string[];
};

export type PypelineCherryResult = {
  mode: 'include' | 'exclude';
  gmudsFound: GmudInfo[];
  gmudsSelected: string[];
  gmudsExcluded: string[];
  filesIncluded: string[];
  filesExcluded: string[];
};

// ── Detecção de GMUDs via tags ────────────────────────────────────────────
//
// Fluxo (rebase-and-merge + delete branch):
//
//   1. Dev trabalha na branch GMUD12345 (3 commits: A1, A2, A3)
//   2. PR pra Release-v5.0.0
//   3. Rebase and merge → commits viram A1', A2', A3' (hashes novos)
//   4. Branch GMUD12345 deletada
//   5. Tag GMUD12345 criada no A3' (último commit após rebase)
//
// A tag marca o ÚLTIMO commit da GMUD na release.
// Para encontrar TODOS os commits da GMUD, usamos --first-parent
// para identificar os commits que foram adicionados naquele "bloco" de rebase.
//
// Abordagem robusta (funciona mesmo com PRs intercalados):
//   Para cada tag GMUD, pegamos os arquivos com:
//     git diff-tree --no-commit-id -r <tag-commit>
//   Isso dá os arquivos do commit da tag. Mas a GMUD pode ter N commits.
//
//   Solução: cada tag GMUD pode ter uma anotação com o número de commits,
//   OU usamos uma segunda tag para marcar o início.
//
//   Solução pragmática: tag anotada com campo "commits: N"
//     git tag -a GMUD12345 -m "commits: 3"
//   Ou: duas tags (GMUD12345-start e GMUD12345)
//   Ou: tag simples + contagem de commits via convenção de PR title
//
//   Solução MAIS SIMPLES (escolhida):
//     A tag aponta pro último commit. O comando aceita uma flag --commits N
//     na tag anotada, ou calcula os arquivos de TODOS os commits entre
//     a tag e a tag GMUD anterior (ou baseline).
//     Se os merges intercalam → o dev usa tag anotada com contagem.
//
// Na prática: tag simples no último commit + arquivo cherry_gmuds.json
// para registrar manualmente quantos commits cada GMUD tem.
// Ou, mais prático: usamos git diff entre baseline e tag pra pegar
// TODOS os arquivos que mudaram ATÉ aquela GMUD, e subtraímos os
// arquivos das GMUDs anteriores.
//
// ABORDAGEM FINAL (mais confiável):
//   Pedimos que o dev crie a tag COMO TAG ANOTADA com a contagem:
//     git tag -a GMUD12345 -m "3"
//   O número na mensagem = quantos commits pra trás pertencem a essa GMUD.
//   Se for tag simples (sem mensagem), assume 1 commit.

function getTagMessage(tagName: string): string {
  try {
    return execSync(`git tag -l --format="%(contents:subject)" ${tagName}`, {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function parseCommitCount(tagMessage: string): number {
  // Aceita: "3", "commits: 3", "commits:3", "3 commits"
  const match = /(\d+)/.exec(tagMessage);
  return match ? parseInt(match[1], 10) : 1;
}

function detectGmuds(baselineHash: string, prefix: string): GmudInfo[] {
  const allTags = execSync('git tag --list --sort=creatordate', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  const prefixUpper = prefix.toUpperCase();
  const gmudTags = allTags.filter((tag) => tag.toUpperCase().startsWith(prefixUpper));

  if (gmudTags.length === 0) return [];

  // Pegar todos os commits no range baseline..HEAD
  const allCommitsInRange = new Set(
    execSync(`git rev-list ${baselineHash}..HEAD`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
  );

  const gmuds: GmudInfo[] = [];

  for (const tagName of gmudTags) {
    // Resolver a tag pro commit (pra tags anotadas, precisa de ^{})
    let tagCommit: string;
    try {
      tagCommit = execSync(`git rev-parse "${tagName}^{commit}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      try {
        tagCommit = execSync(`git rev-parse ${tagName}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        continue;
      }
    }

    // Tag está no range baseline..HEAD?
    if (!allCommitsInRange.has(tagCommit)) continue;

    // Ler mensagem da tag pra saber quantos commits
    const tagMsg = getTagMessage(tagName);
    const commitCount = parseCommitCount(tagMsg);

    // Pegar os N commits a partir da tag (pra trás)
    const commitsRaw = execSync(
      `git log --format="%H|%s" -${commitCount} ${tagCommit}`,
      { encoding: 'utf8' }
    ).trim();

    const commits: GmudCommit[] = commitsRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.split('|');
        return { hash, subject: rest.join('|') };
      });

    // Arquivos: union de todos os commits da GMUD
    const filesSet = new Set<string>();
    for (const commit of commits) {
      const filesRaw = execSync(
        `git diff-tree --no-commit-id --name-only -r ${commit.hash}`,
        { encoding: 'utf8' }
      ).trim();
      for (const f of filesRaw.split('\n').filter(Boolean)) {
        filesSet.add(f);
      }
    }

    // Info do commit da tag
    const info = execSync(
      `git log -1 --format="%ai|%an" ${tagCommit}`,
      { encoding: 'utf8' }
    ).trim();
    const [date, author] = info.split('|');

    const gmudMatch = new RegExp(`${prefix}[_-]?\\w+`, 'i').exec(tagName);
    const id = gmudMatch?.[0] ?? tagName;

    gmuds.push({
      id,
      tagName,
      tagCommit,
      date: (date ?? '').slice(0, 10),
      author: author ?? 'unknown',
      commits,
      files: [...filesSet],
    });
  }

  return gmuds;
}

// ── Comando ───────────────────────────────────────────────────────────────

export default class PypelineCherry extends SfCommand<PypelineCherryResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    exclude: Flags.string({
      char: 'x',
      summary: messages.getMessage('flags.exclude.summary'),
      multiple: true,
    }),
    include: Flags.string({
      char: 'i',
      summary: messages.getMessage('flags.include.summary'),
      multiple: true,
    }),
    list: Flags.boolean({
      char: 'l',
      summary: messages.getMessage('flags.list.summary'),
      default: false,
    }),
    prefix: Flags.string({
      summary: messages.getMessage('flags.prefix.summary'),
      default: 'GMUD',
    }),
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

  public async run(): Promise<PypelineCherryResult> {
    const { flags } = await this.parse(PypelineCherry);

    if (!fileExists(BASELINE_FILE())) {
      this.error('baseline.txt não encontrado. Execute sf pypeline init primeiro.');
    }

    const baseline = readFileTrimmed(BASELINE_FILE());
    const prefix = flags['prefix'] ?? 'GMUD';

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║         PYPELINE CHERRY (GMUD SELECT)        ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  Baseline : ${baseline.slice(0, 12)}...`);
    this.log(`  Prefixo  : ${prefix}*`);

    // ── Detectar GMUDs ────────────────────────────────────────────────
    const gmuds = detectGmuds(baseline, prefix);

    if (gmuds.length === 0) {
      this.log('');
      this.log(`  Nenhuma tag ${prefix}* encontrada entre o baseline e HEAD.`);
      this.log('');
      this.log('  Como criar tags de GMUD:');
      this.log('');
      this.log('    GMUD com 1 commit (tag simples):');
      this.log('      git tag GMUD12345');
      this.log('      git push origin GMUD12345');
      this.log('');
      this.log('    GMUD com N commits (tag anotada):');
      this.log('      git tag -a GMUD12345 -m "3"');
      this.log('      git push origin GMUD12345');
      this.log('');
      this.log('    O número na mensagem indica quantos commits');
      this.log('    pra trás pertencem a essa GMUD.');
      this.log('');
      return {
        mode: 'include',
        gmudsFound: [],
        gmudsSelected: [],
        gmudsExcluded: [],
        filesIncluded: [],
        filesExcluded: [],
      };
    }

    // ── Listar GMUDs ──────────────────────────────────────────────────
    this.log(`  GMUDs     : ${gmuds.length}`);
    this.log('');

    for (const gmud of gmuds) {
      this.log(`  ── ${gmud.id} ${'─'.repeat(Math.max(1, 40 - gmud.id.length))}`);
      this.log(`     Tag     : ${gmud.tagName}`);
      this.log(`     Commit  : ${gmud.tagCommit.slice(0, 12)}`);
      this.log(`     Commits : ${gmud.commits.length}`);
      this.log(`     Data    : ${gmud.date}`);
      this.log(`     Autor   : ${gmud.author}`);
      this.log(`     Arquivos: ${gmud.files.length}`);
      for (const file of gmud.files.slice(0, 8)) {
        this.log(`       ${file}`);
      }
      if (gmud.files.length > 8) {
        this.log(`       ... e mais ${gmud.files.length - 8} arquivo(s)`);
      }
      this.log('');
    }

    if (flags['list']) {
      return {
        mode: 'include',
        gmudsFound: gmuds,
        gmudsSelected: gmuds.map((g) => g.id),
        gmudsExcluded: [],
        filesIncluded: gmuds.flatMap((g) => g.files),
        filesExcluded: [],
      };
    }

    // ── Determinar modo ───────────────────────────────────────────────
    const excludeIds = flags['exclude'] ?? [];
    const includeIds = flags['include'] ?? [];

    if (excludeIds.length > 0 && includeIds.length > 0) {
      this.error('Use --exclude OU --include, não os dois ao mesmo tempo.');
    }

    let selectedGmuds: GmudInfo[];
    let excludedGmuds: GmudInfo[];
    let mode: 'include' | 'exclude';

    if (excludeIds.length > 0) {
      mode = 'exclude';
      const excludeSet = new Set(excludeIds.map((id) => id.toUpperCase()));
      for (const id of excludeSet) {
        if (!gmuds.some((g) => g.id.toUpperCase() === id)) {
          this.warn(`GMUD '${id}' não encontrada nas tags. Ignorando.`);
        }
      }
      excludedGmuds = gmuds.filter((g) => excludeSet.has(g.id.toUpperCase()));
      selectedGmuds = gmuds.filter((g) => !excludeSet.has(g.id.toUpperCase()));
    } else if (includeIds.length > 0) {
      mode = 'include';
      const includeSet = new Set(includeIds.map((id) => id.toUpperCase()));
      for (const id of includeSet) {
        if (!gmuds.some((g) => g.id.toUpperCase() === id)) {
          this.warn(`GMUD '${id}' não encontrada nas tags. Ignorando.`);
        }
      }
      selectedGmuds = gmuds.filter((g) => includeSet.has(g.id.toUpperCase()));
      excludedGmuds = gmuds.filter((g) => !includeSet.has(g.id.toUpperCase()));
    } else {
      mode = 'include';
      selectedGmuds = gmuds;
      excludedGmuds = [];
    }

    // ── Calcular arquivos ─────────────────────────────────────────────
    const filesIncluded = [...new Set(selectedGmuds.flatMap((g) => g.files))];
    const filesExcluded = [...new Set(excludedGmuds.flatMap((g) => g.files))];

    const conflictFiles = filesIncluded.filter((f) => filesExcluded.includes(f));
    if (conflictFiles.length > 0) {
      this.warn(`${conflictFiles.length} arquivo(s) em GMUDs incluídas E excluídas:`);
      for (const f of conflictFiles) {
        this.log(`    ⚠ ${f} (mantido — presente em GMUD incluída)`);
      }
    }

    const finalExcluded = filesExcluded.filter((f) => !filesIncluded.includes(f));

    // ── Resumo ────────────────────────────────────────────────────────
    this.log('────────────────────────────────────────────────');
    this.log(`  Modo         : ${mode}`);
    this.log(`  Incluídas    : ${selectedGmuds.map((g) => g.id).join(', ') || '(nenhuma)'}`);
    this.log(`  Excluídas    : ${excludedGmuds.map((g) => g.id).join(', ') || '(nenhuma)'}`);
    this.log(`  Arquivos in  : ${filesIncluded.length}`);
    this.log(`  Arquivos out : ${finalExcluded.length}`);
    this.log('');

    // ── Build seletivo ────────────────────────────────────────────────
    if (!flags['dry-run'] && filesIncluded.length > 0) {
      const confirmed = await this.confirm({
        message: `Gerar build com ${filesIncluded.length} arquivo(s) de ${selectedGmuds.length} GMUD(s)?`,
      });

      if (!confirmed) {
        this.log('[CANCELADO] Build não executado.');
        return {
          mode,
          gmudsFound: gmuds,
          gmudsSelected: selectedGmuds.map((g) => g.id),
          gmudsExcluded: excludedGmuds.map((g) => g.id),
          filesIncluded,
          filesExcluded: finalExcluded,
        };
      }

      const buildDir = BUILD_DIR();
      if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
      fs.mkdirSync(buildDir, { recursive: true });

      this.log('  Copiando arquivos para build...');
      for (const file of filesIncluded) {
        try {
          copyFile(file, buildDir);
          this.log(`    ✔ ${file}`);
        } catch (err) {
          this.warn(`    ✘ ${file}: ${(err as Error).message}`);
        }
      }

      writeFile(path.join(PROJECT_DIR(), 'cherry_included.txt'), filesIncluded.join('\n'));
      writeFile(path.join(PROJECT_DIR(), 'cherry_excluded.txt'), finalExcluded.join('\n'));
      writeFile(
        path.join(PROJECT_DIR(), 'cherry_gmuds.json'),
        JSON.stringify({
          mode,
          selected: selectedGmuds.map((g) => ({
            id: g.id,
            tag: g.tagName,
            commit: g.tagCommit,
            commitCount: g.commits.length,
          })),
          excluded: excludedGmuds.map((g) => ({
            id: g.id,
            tag: g.tagName,
            commit: g.tagCommit,
            commitCount: g.commits.length,
          })),
          timestamp: new Date().toISOString(),
        }, null, 2)
      );

      this.log('');
      this.log('╔══════════════════════════════════════════════╗');
      this.log('║  BUILD SELETIVO CONCLUÍDO                    ║');
      this.log('║  Execute: sf pypeline package                ║');
      this.log('║  Depois: sf pypeline validate-prd            ║');
      this.log('╚══════════════════════════════════════════════╝');
    }

    this.log('');

    return {
      mode,
      gmudsFound: gmuds,
      gmudsSelected: selectedGmuds.map((g) => g.id),
      gmudsExcluded: excludedGmuds.map((g) => g.id),
      filesIncluded,
      filesExcluded: finalExcluded,
    };
  }
}
