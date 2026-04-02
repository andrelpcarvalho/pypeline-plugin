/**
 * test/unit/commands/pypeline/run.test.ts
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineRun from '../../../../src/commands/pypeline/run.js';
import { FAKE_COMMIT_HASH, FAKE_JOB_ID, assertRejects } from '../../../helpers.js';

// Novo baseline que o build.ts publica via env
const FAKE_NEW_BASELINE = 'zzz9999aaa0000bbb1111ccc2222ddd3333eee44';

describe('pypeline run', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Simula o env que o build.ts publica com o novoBaseline
    process.env['PYPELINE_NOVO_BASELINE'] = FAKE_NEW_BASELINE;
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env['PYPELINE_NOVO_BASELINE'];
  });

  function stubPipelineSpawn(exitCodes: {
    build?: number;
    package?: number;
    training?: number;
    validate?: number;
  } = {}): sinon.SinonStub {
    const codes = { build: 0, package: 0, training: 0, validate: 0, ...exitCodes };

    return sandbox.stub(childProcess, 'spawn').callsFake((_bin: string, args: readonly string[]) => {
      let exitCode = 0;
      if (args.includes('build'))    exitCode = codes.build;
      if (args.includes('package'))  exitCode = codes.package;
      if (args.includes('training')) exitCode = codes.training;
      if (args.includes('validate')) exitCode = codes.validate;

      const fakeProc = {
        stdout: { on: (): void => { /* noop */ } },
        stderr: { on: (): void => { /* noop */ } },
        on: (event: string, cb: (code: number) => void): void => {
          if (event === 'close') setTimeout(() => cb(exitCode), 0);
        },
      };
      return fakeProc as never;
    });
  }

  function setupBaseFs(logContent = `Job ID: ${FAKE_JOB_ID}`): void {
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
    expect(result.success).to.equal(true);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  // ── Melhoria 2: baseline deve ser o novoBaseline, não o backup ───────────

  it('deve gravar o novoBaseline calculado pelo build, não o baseline original', async () => {
    setupBaseFs();
    stubPipelineSpawn();
    const result = await PypelineRun.run([]);
    expect(result.baselineUpdated).to.equal(FAKE_NEW_BASELINE);

    const writeStub = fs.writeFileSync as sinon.SinonStub;
    const baselineWrite = (writeStub.args as unknown[][]).find(
      (a) => String(a[0]).includes('baseline')
    );
    expect(baselineWrite).to.not.equal(undefined);
    expect(String(baselineWrite![1])).to.include(FAKE_NEW_BASELINE);
  });

  // ── Melhoria 3: training opt-in ──────────────────────────────────────────

  it('por padrão não deve chamar pypeline deploy training', async () => {
    setupBaseFs();
    const spawnStub = stubPipelineSpawn();
    await PypelineRun.run([]);
    const trainingCall = (spawnStub.args as unknown[][]).find(
      (a) => Array.isArray(a[1]) && (a[1] as string[]).includes('training')
    );
    expect(trainingCall).to.equal(undefined);
  });

  it('com --training deve chamar pypeline deploy training', async () => {
    setupBaseFs();
    const spawnStub = stubPipelineSpawn();
    await PypelineRun.run(['--training']);
    const trainingCall = (spawnStub.args as unknown[][]).find(
      (a) => Array.isArray(a[1]) && (a[1] as string[]).includes('training')
    );
    expect(trainingCall).to.not.equal(undefined);
  });

  // ── Melhoria 4: regex Status : Failed ───────────────────────────────────

  it('deve fazer rollback se o log contiver "Status : Failed"', async () => {
    setupBaseFs('Deploy completed.\nStatus : Failed\nErrors found.');
    stubPipelineSpawn();
    await assertRejects(PypelineRun.run([]), /validate PRD/);
  });

  it('não deve fazer rollback se o log não contiver "Status : Failed"', async () => {
    setupBaseFs(`Status : Succeeded\nJob ID: ${FAKE_JOB_ID}`);
    stubPipelineSpawn();
    const result = await PypelineRun.run([]);
    expect(result.success).to.equal(true);
  });

  // ── Rollback ───────────────────────────────────────────────────────────

  it('deve fazer rollback e lançar erro se o build falhar', async () => {
    setupBaseFs();
    stubPipelineSpawn({ build: 1 });
    await assertRejects(PypelineRun.run([]), /pypeline build/);
    const writeStub = fs.writeFileSync as sinon.SinonStub;
    const restored = (writeStub.args as unknown[][]).some(
      (a) => String(a[0]).includes('baseline') && String(a[1]).includes(FAKE_COMMIT_HASH)
    );
    expect(restored).to.equal(true);
  });

  it('deve fazer rollback e lançar erro se o package.xml falhar', async () => {
    setupBaseFs();
    stubPipelineSpawn({ package: 1 });
    await assertRejects(PypelineRun.run([]), /pypeline package/);
  });

  it('deve fazer rollback se o validate PRD falhar', async () => {
    setupBaseFs();
    stubPipelineSpawn({ validate: 1 });
    await assertRejects(PypelineRun.run([]), /pypeline validate prd/);
  });

  it('deve falhar imediatamente se baseline.txt não existir', async () => {
    sandbox.stub(fs, 'existsSync').returns(false);
    await assertRejects(PypelineRun.run([]), /baseline\.txt não encontrado/);
  });

  it('deve passar --prd-org para o subcomando validate', async () => {
    setupBaseFs();
    const spawnStub = stubPipelineSpawn();
    await PypelineRun.run(['--prd-org', 'minha-producao']);
    const validateCall = (spawnStub.args as unknown[][]).find(
      (a) => Array.isArray(a[1]) && (a[1] as string[]).includes('validate')
    );
    expect(validateCall).to.not.equal(undefined);
    expect(validateCall![1] as string[]).to.include('minha-producao');
  });
});
