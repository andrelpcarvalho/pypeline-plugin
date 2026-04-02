/**
 * test/unit/commands/pypeline/build.test.ts
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineBuild from '../../../../src/commands/pypeline/build.js';
import {
  FAKE_COMMIT_HASH,
  FAKE_NEW_BASELINE,
  assertRejects,
  stubFs,
  stubExecSync,
  stubSpawnSync,
} from '../../../helpers.js';

describe('pypeline build', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  function setupHappyPath(): void {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 0);
    sandbox.stub(fs, 'copyFileSync');
    sandbox.stub(fs, 'cpSync');
  }

  it('deve retornar o commitHash e o novoBaseline no happy path', async () => {
    setupHappyPath();
    const result = await PypelineBuild.run([]);
    expect(result.commitHash).to.equal(FAKE_COMMIT_HASH);
    expect(result.novoBaseline).to.equal(FAKE_NEW_BASELINE);
  });

  it('deve classificar arquivos added, modified e deleted corretamente', async () => {
    setupHappyPath();
    const result = await PypelineBuild.run([]);
    expect(result.added).to.have.length(1);
    expect(result.modified).to.have.length(1);
    expect(result.deleted).to.have.length(1);
  });

  it('deve aceitar flag --branch customizada', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    const spawnSyncStub = stubSpawnSync(sandbox, 0);
    sandbox.stub(fs, 'copyFileSync');
    sandbox.stub(fs, 'cpSync');

    await PypelineBuild.run(['--branch', 'minha-branch']);

    const checkoutCall = spawnSyncStub.args.find(
      (a: unknown[]) => Array.isArray(a[1]) && (a[1] as string[]).includes('minha-branch')
    );
    expect(checkoutCall).to.not.equal(undefined);
  });

  it('com --dry-run não deve chamar cpSync nem copyFileSync', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 0);
    const copyStub = sandbox.stub(fs, 'copyFileSync');
    const cpStub   = sandbox.stub(fs, 'cpSync');

    await PypelineBuild.run(['--dry-run']);

    expect(copyStub.callCount).to.equal(0);
    expect(cpStub.callCount).to.equal(0);
  });

  it('deve lançar erro se baseline.txt não existir', async () => {
    stubFs(sandbox, { existsSync: false });
    stubSpawnSync(sandbox, 0);
    await assertRejects(PypelineBuild.run([]), /baseline.txt/);
  });

  it('deve lançar erro se o comando sf project generate falhar', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 1);
    await assertRejects(PypelineBuild.run([]), /Falha ao gerar estrutura/);
  });

  it('deve continuar mesmo se um arquivo individual não for encontrado', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 0);
    sandbox.stub(fs, 'copyFileSync').onFirstCall().throws(new Error('ENOENT')).returns(undefined);
    sandbox.stub(fs, 'cpSync');

    const result = await PypelineBuild.run([]);
    expect(result).to.not.equal(undefined);
  });
});
