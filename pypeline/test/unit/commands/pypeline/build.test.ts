import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';
import type { EsmockModule, BuildResult } from '../../../types.js';
import { FAKE_COMMIT_HASH, FAKE_NEW_BASELINE, assertRejects, makeExecSyncFake, makeSpawnSyncFake } from '../../../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../../../src').split(pathSep).join('/');

const FAKE_DIFF = {
  added:      ['force-app/main/default/classes/NewClass.cls'],
  modified:   ['force-app/main/default/classes/MyClass.cls'],
  deleted:    ['force-app/main/default/classes/OldClass.cls'],
  notDeleted: ['force-app/main/default/classes/NewClass.cls', 'force-app/main/default/classes/MyClass.cls'],
};

const BASE_CONFIG = {
  BASELINE_FILE: () => '/fake/baseline.txt', BUILD_DIR: () => '/fake/build',
  PROJECT_DIR:   () => '/fake/project',      SOURCE_DIR: () => '/fake/source',
  PROJECT_NAME:  'build_deploy',             BRANCH:    'release-v4.0.0',
  SCRIPT_DIR:    '/fake/script',
  readFileTrimmed: () => FAKE_COMMIT_HASH,
  writeFile:       sinon.spy(),
  gitDiffFiles:    () => FAKE_DIFF,
};

// existsSync retorna true para tudo exceto o sfdxJson — simula projeto já gerado
function makeFs(sfdxJsonExists = true): Record<string, unknown> {
  return {
    existsSync:   (p: string) => String(p).includes('sfdx-project.json') ? sfdxJsonExists : true,
    readFileSync:  () => FAKE_COMMIT_HASH + '\n',
    writeFileSync: sinon.spy(), mkdirSync: sinon.spy(), rmSync: sinon.spy(),
    copyFileSync:  sinon.spy(), cpSync: sinon.spy(), unlinkSync: sinon.spy(),
  };
}

async function loadBuild(opts: { spawnSyncStatus?: number; fileExists?: boolean; sfdxJsonExists?: boolean } = {}): Promise<EsmockModule<BuildResult>> {
  const raw: unknown = await esmock(`${SRC}/commands/pypeline/build.js`, {
    'node:fs':            makeFs(opts.sfdxJsonExists ?? true),
    'node:child_process': { execSync: makeExecSyncFake(), spawnSync: makeSpawnSyncFake(opts.spawnSyncStatus ?? 0) },
    [`${SRC}/config.js`]:    { ...BASE_CONFIG, fileExists: () => opts.fileExists ?? true },
    [`${SRC}/fileUtils.js`]: { copyFile: sinon.spy() },
  });
  return raw as EsmockModule<BuildResult>;
}

describe('pypeline build', () => {
  it('deve retornar o commitHash e o novoBaseline no happy path', async () => {
    const { default: Cmd } = await loadBuild();
    const result = await Cmd.run([]);
    expect(result.commitHash).to.equal(FAKE_COMMIT_HASH);
    expect(result.novoBaseline).to.equal(FAKE_NEW_BASELINE);
  });

  it('deve classificar arquivos added, modified e deleted corretamente', async () => {
    const { default: Cmd } = await loadBuild();
    const result = await Cmd.run([]);
    expect(result.added).to.have.length(1);
    expect(result.modified).to.have.length(1);
    expect(result.deleted).to.have.length(1);
  });

  it('com --dry-run não deve chamar copyFile', async () => {
    const copyFileSpy = sinon.spy();
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/build.js`, {
      'node:fs':            makeFs(true),
      'node:child_process': { execSync: makeExecSyncFake(), spawnSync: makeSpawnSyncFake(0) },
      [`${SRC}/config.js`]:    { ...BASE_CONFIG, fileExists: () => true,
        gitDiffFiles: () => ({ added: [], modified: ['file.cls'], deleted: [], notDeleted: ['file.cls'] }) },
      [`${SRC}/fileUtils.js`]: { copyFile: copyFileSpy },
    });
    const { default: Cmd } = raw as EsmockModule<BuildResult>;
    await Cmd.run(['--dry-run']);
    expect(copyFileSpy.callCount).to.equal(0);
  });

  it('deve lançar erro se baseline.txt não existir', async () => {
    const { default: Cmd } = await loadBuild({ fileExists: false });
    await assertRejects(Cmd.run([]), /baseline\.txt/);
  });

  it('deve lançar erro se sf project generate falhar', async () => {
    // sfdxJson não existe → entra no generate → spawnSync retorna status 1 → erro
    const { default: Cmd } = await loadBuild({ spawnSyncStatus: 1, sfdxJsonExists: false });
    await assertRejects(Cmd.run([]), /Falha ao gerar estrutura/);
  });

  it('deve pular o generate se a estrutura já existir', async () => {
    // sfdxJson existe → pula o generate → spawnSyncStatus irrelevante
    const { default: Cmd } = await loadBuild({ sfdxJsonExists: true });
    const result = await Cmd.run([]);
    expect(result.commitHash).to.equal(FAKE_COMMIT_HASH);
  });
});
