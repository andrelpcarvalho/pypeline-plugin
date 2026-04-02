/**
 * test/nuts/pypeline.nut.ts
 * NUT = Non-Unit Test. Roda contra uma org Salesforce real.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { expect } from 'chai';

const NUT_ORG = process.env['NUT_ORG_ALIAS'] ?? 'treino';

type RunResult = { stdout: string; stderr: string; exitCode: number };

function runSf(args: string): RunResult {
  try {
    const stdout = execSync(`sf ${args}`, { encoding: 'utf8' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.status ?? 1 };
  }
}

describe('[NUT] pypeline build', function () {
  this.timeout(120_000);
  it('deve gerar a pasta build_deploy sem erros', () => {
    const { exitCode, stderr } = runSf('pypeline build --dry-run');
    expect(exitCode, `stderr: ${stderr}`).to.equal(0);
  });
});

describe('[NUT] pypeline package', function () {
  this.timeout(60_000);
  it('deve gerar package.xml na pasta de build', () => {
    const { exitCode, stderr } = runSf('pypeline package');
    expect(exitCode, `stderr: ${stderr}`).to.equal(0);
    expect(fs.existsSync('build_deploy/package.xml')).to.equal(true);
  });
});

describe('[NUT] pypeline validate prd', function () {
  this.timeout(1_800_000);
  before(function () { if (!process.env['RUN_VALIDATE_NUT']) this.skip(); });

  it('deve validar em PRD e gerar um Job ID', () => {
    const { exitCode, stdout, stderr } = runSf(`pypeline validate prd --target-org ${NUT_ORG}`);
    expect(exitCode, `stderr: ${stderr}`).to.equal(0);
    expect(stdout).to.match(/Job ID salvo|prd_job_id\.txt/);
    expect(fs.existsSync('prd_job_id.txt')).to.equal(true);
    expect(fs.readFileSync('prd_job_id.txt', 'utf8').trim()).to.match(/^0Af[0-9A-Za-z]{15}$/);
  });
});

describe('[NUT] pypeline quickdeploy', function () {
  this.timeout(1_800_000);
  before(function () {
    if (!process.env['RUN_QUICKDEPLOY_NUT'] || !fs.existsSync('prd_job_id.txt')) this.skip();
  });

  it('deve executar o quick deploy em PRD sem erros', () => {
    const { exitCode, stderr } = runSf(`pypeline quickdeploy --target-org ${NUT_ORG} --no-prompt`);
    expect(exitCode, `stderr: ${stderr}`).to.equal(0);
    expect(fs.existsSync('prd_job_id.txt')).to.equal(false);
  });
});
