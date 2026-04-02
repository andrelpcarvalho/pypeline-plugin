/**
 * test/unit/commands/pypeline/validate/prd.test.ts
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineValidatePrd from '../../../../../src/commands/pypeline/validate/prd.js';
import { FAKE_JOB_ID, assertRejects, stubSpawn, stubCreateWriteStream } from '../../../../helpers.js';

describe('pypeline validate prd', () => {
  let sandbox: sinon.SinonSandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  it('deve extrair o Job ID do output e salvá-lo em prd_job_id.txt', async () => {
    const logLine = `Deployment validation successful. Job ID: ${FAKE_JOB_ID}\n`;
    stubSpawn(sandbox, { exitCode: 0, lines: [logLine] });
    stubCreateWriteStream(sandbox);
    const writeStub = sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');

    const result = await PypelineValidatePrd.run([]);
    expect(result.jobId).to.equal(FAKE_JOB_ID);

    const jobIdWrite = (writeStub.args as unknown[][]).find(
      (a) => String(a[1]).includes(FAKE_JOB_ID)
    );
    expect(jobIdWrite).to.not.equal(undefined);
  });

  it('deve retornar jobId null se não houver Job ID no log', async () => {
    stubSpawn(sandbox, { exitCode: 0, lines: ['Validate done, no job id here\n'] });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    const result = await PypelineValidatePrd.run([]);
    expect(result.jobId).to.equal(null);
  });

  it('deve lançar erro quando o validate falha', async () => {
    stubSpawn(sandbox, { exitCode: 1, lines: ['Error: deploy failed\n'] });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    await assertRejects(PypelineValidatePrd.run([]), /falhou com exit code 1/);
  });

  it('deve aceitar Job ID no meio de uma linha com mais texto', async () => {
    const logLine = `[sf] Validation Job ${FAKE_JOB_ID} queued successfully\n`;
    stubSpawn(sandbox, { exitCode: 0, lines: [logLine] });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    const result = await PypelineValidatePrd.run([]);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve respeitar --target-org customizada', async () => {
    const spawnStub = stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    await PypelineValidatePrd.run(['--target-org', 'producao']);
    const args = spawnStub.firstCall.args[1] as string[];
    expect(args).to.include('producao');
  });
});
