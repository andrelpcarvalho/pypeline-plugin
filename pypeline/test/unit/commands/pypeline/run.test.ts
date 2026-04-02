/**
 * test/unit/commands/pypeline/run.test.ts
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineRun from '../../../../src/commands/pypeline/run.js';
import { FAKE_COMMIT_HASH, FAKE_JOB_ID, assertRejects } from '../../../helpers.js';

describe('pypeline run', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  function stubPipelineSpawn(exitCodes: {
    build?: number;
    package?: number;
    training?: number;
    validate?: number;
  } = {}): sinon.SinonStub {
    const codes = { build: 0, package: 0, training: 0, validate: 0, ...exitCodes };

    return sandbox.stub(childProcess, 'spawn').callsFake((_bin: string, args: string[]) => {
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

  it('deve concluir o pipeline com sucesso quando todas as etapas passam', async () => {
    setupBaseFs();
    stubPipelineSpawn();
    const result = await PypelineRun.run([]);
    expect(result.success).to.equal(true);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve atualizar baselineUpdated no resultado', async () => {
    setupBaseFs();
    stubPipelineSpawn();
    const result = await PypelineRun.run([]);
    expect(result.baselineUpdated).to.equal(FAKE_COMMIT_HASH);
  });

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

  it('deve fazer rollback se o log de PRD contiver erros', async () => {
    setupBaseFs('Deploy failed: error in class MyClass');
    stubPipelineSpawn();
    await assertRejects(PypelineRun.run([]), /validate PRD/);
  });

  it('com --skip-training não deve chamar pypeline deploy training', async () => {
    setupBaseFs();
    const spawnStub = stubPipelineSpawn();
    await PypelineRun.run(['--skip-training']);
    const trainingCall = (spawnStub.args as unknown[][]).find(
      (a) => Array.isArray(a[1]) && (a[1] as string[]).includes('training')
    );
    expect(trainingCall).to.equal(undefined);
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
