/**
 * test/unit/commands/pypeline/build.test.ts
 *
 * Testa o comando `sf pypeline build`.
 *
 * COMO TESTAR COMANDOS OCLIF:
 * Em vez de chamar o comando pela linha de terminal, instanciamos a classe
 * diretamente e chamamos .run(). Isso nos permite injetar stubs antes
 * da execução e verificar o que foi retornado.
 *
 * O padrão é:
 *   const result = await PypelineBuild.run(['--flag', 'valor']);
 *   expect(result.campo).to.equal('esperado');
 */

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineBuild from '../../../../src/commands/pypeline/build.js';
import {
  FAKE_COMMIT_HASH,
  FAKE_NEW_BASELINE,
  FAKE_GIT_DIFF,
  stubFs,
  stubExecSync,
  stubSpawnSync,
} from '../../../helpers.js';

describe('pypeline build', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  // Helper: configura todos os stubs necessários para o happy path
  function setupHappyPath() {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox, {
      'git diff':    FAKE_GIT_DIFF,
      'rev-parse':   FAKE_NEW_BASELINE + '\n',
      'rev-list':    'commit1\ncommit2\n',
      'git branch':  '* release-v4.0.0\n',
    });
    stubSpawnSync(sandbox, 0);
    // Stub específico para cp (cópia de arquivos)
    sandbox.stub(fs, 'copyFileSync');
    sandbox.stub(fs, 'cpSync');
  }

  // ── Happy path ─────────────────────────────────────────────────────────

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
    setupHappyPath();
    const spawnStub = sandbox.restore() as unknown; // já tem stub; capturamos o de spawnSync
    const spawnSyncStub = stubSpawnSync(sandbox, 0);
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    sandbox.stub(fs, 'copyFileSync');
    sandbox.stub(fs, 'cpSync');

    await PypelineBuild.run(['--branch', 'minha-branch']);

    // O segundo argumento do primeiro spawnSync deve conter 'minha-branch'
    const checkoutCall = spawnSyncStub.args.find((a: string[][]) => a[1]?.includes('minha-branch'));
    expect(checkoutCall).to.exist;
  });

  // ── --dry-run ──────────────────────────────────────────────────────────

  it('com --dry-run não deve chamar cpSync nem copyFileSync', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 0);
    const copyStub  = sandbox.stub(fs, 'copyFileSync');
    const cpStub    = sandbox.stub(fs, 'cpSync');

    await PypelineBuild.run(['--dry-run']);

    expect(copyStub.called).to.be.false;
    expect(cpStub.called).to.be.false;
  });

  // ── Casos de erro ──────────────────────────────────────────────────────

  it('deve lançar erro se baseline.txt não existir', async () => {
    stubFs(sandbox, { existsSync: false });
    stubSpawnSync(sandbox, 0);

    await expect(PypelineBuild.run([])).to.be.rejectedWith(/baseline.txt/);
  });

  it('deve lançar erro se o comando sf project generate falhar', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 1); // exit code 1 = falha

    await expect(PypelineBuild.run([])).to.be.rejectedWith(/Falha ao gerar estrutura/);
  });

  it('deve continuar mesmo se um arquivo individual não for encontrado', async () => {
    stubFs(sandbox, { readFileSync: FAKE_COMMIT_HASH + '\n' });
    stubExecSync(sandbox);
    stubSpawnSync(sandbox, 0);
    // copyFileSync lança ENOENT no primeiro arquivo
    sandbox.stub(fs, 'copyFileSync').onFirstCall().throws(new Error('ENOENT')).returns(undefined);
    sandbox.stub(fs, 'cpSync');

    // Não deve rejeitar — apenas emite warning
    const result = await PypelineBuild.run([]);
    expect(result).to.exist;
  });
});
