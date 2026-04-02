/**
 * test/unit/commands/pypeline/run.test.ts
 *
 * Este é o teste mais complexo: o comando run orquestra os outros
 * chamando-os via spawn('sf', ['pypeline', 'build'], ...).
 *
 * ESTRATÉGIA:
 * Stubamos spawn para controlar o exit code de cada subcomando
 * individualmente, baseado nos argumentos recebidos.
 *
 * Ex: spawn('sf', ['pypeline', 'build']) → exit 0
 *     spawn('sf', ['pypeline', 'validate', 'prd']) → exit 0
 *
 * Isso nos permite testar o rollback ao simular falhas em etapas específicas.
 */

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineRun from '../../../../src/commands/pypeline/run.js';
import { FAKE_COMMIT_HASH, FAKE_JOB_ID } from '../../../helpers.js';

describe('pypeline run', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  // Helper: monta um spawn fake que responde por subcomando
  function stubPipelineSpawn(exitCodes: {
    build?: number;
    package?: number;
    training?: number;
    validate?: number;
  } = {}) {
    const codes = { build: 0, package: 0, training: 0, validate: 0, ...exitCodes };

    return sandbox.stub(childProcess, 'spawn').callsFake((_bin: string, args: string[]) => {
      let exitCode = 0;
      if (args.includes('build'))    exitCode = codes.build;
      if (args.includes('package'))  exitCode = codes.package;
      if (args.includes('training')) exitCode = codes.training;
      if (args.includes('validate')) exitCode = codes.validate;

      const fakeProc = {
        stdout: { on: (_e: string, _cb: unknown) => {} },
        stderr: { on: (_e: string, _cb: unknown) => {} },
        on: (event: string, cb: (code: number) => void) => {
          if (event === 'close') setTimeout(() => cb(exitCode), 0);
        },
      };
      return fakeProc as never;
    });
  }

  function setupBaseFs(logContent = `Job ID: ${FAKE_JOB_ID}`) {
    // baseline.txt existe e contém um hash
    sandbox.stub(fs, 'existsSync').callsFake((p: unknown) => {
      if (String(p).includes('baseline')) return true;
      if (String(p).includes('prd_output')) return true;
      return false;
    });
    sandbox.stub(fs, 'readFileSync').callsFake((p: unknown) => {
      if (String(p).includes('baseline')) return FAKE_COMMIT_HASH + '\n';
      if (String(p).includes('prd_output')) return logContent;
      return '';
    });
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
  }

  // ── Happy path ─────────────────────────────────────────────────────────

  it('deve concluir o pipeline com sucesso quando todas as etapas passam', async () => {
    setupBaseFs();
    stubPipelineSpawn();

    const result = await PypelineRun.run([]);

    expect(result.success).to.be.true;
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve atualizar baselineUpdated no resultado', async () => {
    setupBaseFs();
    stubPipelineSpawn();

    const result = await PypelineRun.run([]);
    expect(result.baselineUpdated).to.equal(FAKE_COMMIT_HASH);
  });

  // ── Rollback ───────────────────────────────────────────────────────────

  it('deve fazer rollback e lançar erro se o build falhar', async () => {
    setupBaseFs();
    stubPipelineSpawn({ build: 1 });

    await expect(PypelineRun.run([])).to.be.rejectedWith(/pypeline build/);

    // Deve ter restaurado o baseline
    const writeStub = fs.writeFileSync as sinon.SinonStub;
    const baselineRestored = writeStub.args.some((a) =>
      String(a[0]).includes('baseline') && String(a[1]).includes(FAKE_COMMIT_HASH)
    );
    expect(baselineRestored).to.be.true;
  });

  it('deve fazer rollback e lançar erro se o package.xml falhar', async () => {
    setupBaseFs();
    stubPipelineSpawn({ package: 1 });

    await expect(PypelineRun.run([])).to.be.rejectedWith(/pypeline package/);
  });

  it('deve fazer rollback se o validate PRD falhar', async () => {
    setupBaseFs();
    stubPipelineSpawn({ validate: 1 });

    await expect(PypelineRun.run([])).to.be.rejectedWith(/pypeline validate prd/);
  });

  it('deve fazer rollback se o log de PRD contiver erros', async () => {
    // Log com "error" no conteúdo
    setupBaseFs('Deploy failed: error in class MyClass');
    stubPipelineSpawn();

    await expect(PypelineRun.run([])).to.be.rejectedWith(/validate PRD/);
  });

  // ── Flags ──────────────────────────────────────────────────────────────

  it('com --skip-training não deve chamar pypeline deploy training', async () => {
    setupBaseFs();
    const spawnStub = stubPipelineSpawn();

    await PypelineRun.run(['--skip-training']);

    const trainingCall = spawnStub.args.find((a: string[][]) => a[1]?.includes('training'));
    expect(trainingCall).to.be.undefined;
  });

  it('deve falhar imediatamente se baseline.txt não existir', async () => {
    sandbox.stub(fs, 'existsSync').returns(false);

    await expect(PypelineRun.run([])).to.be.rejectedWith(/baseline\.txt não encontrado/);
  });

  it('deve passar --prd-org para o subcomando validate', async () => {
    setupBaseFs();
    const spawnStub = stubPipelineSpawn();

    await PypelineRun.run(['--prd-org', 'minha-producao']);

    const validateCall = spawnStub.args.find((a: string[][]) => a[1]?.includes('validate'));
    expect(validateCall).to.exist;
    expect(validateCall![1]).to.include('minha-producao');
  });
});
