/**
 * test/nuts/pypeline.nut.ts
 *
 * NUT = Non-Unit Test. Roda contra uma org Salesforce real.
 * Execute com: yarn test:nuts
 *
 * PRÉ-REQUISITOS:
 * - Variável de ambiente NUT_ORG_ALIAS definida com o alias da org de teste
 * - baseline.txt válido no PROJECT_DIR
 * - Conexão autenticada com a org (sf org login)
 *
 * ATENÇÃO: estes testes são lentos (podem levar minutos).
 * Eles NÃO substituem os unit tests — servem para validar
 * que o plugin funciona de ponta a ponta em ambiente real.
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { expect } from 'chai';

// Alias da org usado nos testes de integração
const NUT_ORG = process.env['NUT_ORG_ALIAS'] ?? 'treino';

// Helper: executa um comando sf e retorna stdout + stderr
function runSf(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`sf ${args}`, { encoding: 'utf8' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout:   e.stdout ?? '',
      stderr:   e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

// ── NUT: pypeline build ────────────────────────────────────────────────────

describe('[NUT] pypeline build', function () {
  // NUTs precisam de timeout maior — operações reais são lentas
  this.timeout(120_000);

  it('deve gerar a pasta build_deploy sem erros', () => {
    const { exitCode, stderr } = runSf('pypeline build --dry-run');

    // Com --dry-run não toca na org, só executa git diff
    expect(exitCode).to.equal(0, `stderr: ${stderr}`);
  });
});

// ── NUT: pypeline package ──────────────────────────────────────────────────

describe('[NUT] pypeline package', function () {
  this.timeout(60_000);

  it('deve gerar package.xml na pasta de build', () => {
    const { exitCode, stderr } = runSf('pypeline package');

    expect(exitCode).to.equal(0, `stderr: ${stderr}`);

    // Verifica se o package.xml foi gerado em disco
    // (ajuste o caminho conforme seu PROJECT_DIR)
    const pkgPath = path.join('build_deploy', 'package.xml');
    expect(fs.existsSync(pkgPath)).to.be.true;
  });
});

// ── NUT: pypeline validate prd ─────────────────────────────────────────────

describe('[NUT] pypeline validate prd', function () {
  // Validação pode levar até 30 min dependendo dos testes Apex
  this.timeout(1_800_000);

  // Esse teste SÓ roda se a variável RUN_VALIDATE_NUT estiver definida
  // para evitar deploys acidentais em CI/CD sem configuração adequada
  before(function () {
    if (!process.env['RUN_VALIDATE_NUT']) {
      this.skip();
    }
  });

  it('deve validar em PRD e gerar um Job ID', () => {
    const { exitCode, stdout, stderr } = runSf(`pypeline validate prd --target-org ${NUT_ORG}`);

    expect(exitCode).to.equal(0, `stderr: ${stderr}`);
    expect(stdout).to.match(/Job ID salvo|prd_job_id\.txt/);

    // Verifica se o arquivo de Job ID foi criado
    expect(fs.existsSync('prd_job_id.txt')).to.be.true;
    const jobId = fs.readFileSync('prd_job_id.txt', 'utf8').trim();
    expect(jobId).to.match(/^0Af[0-9A-Za-z]{15}$/);
  });
});

// ── NUT: pypeline quickdeploy ──────────────────────────────────────────────

describe('[NUT] pypeline quickdeploy', function () {
  this.timeout(1_800_000);

  before(function () {
    // Só roda se o arquivo de Job ID existir E a variável estiver setada
    if (!process.env['RUN_QUICKDEPLOY_NUT'] || !fs.existsSync('prd_job_id.txt')) {
      this.skip();
    }
  });

  it('deve executar o quick deploy em PRD sem erros', () => {
    const { exitCode, stderr } = runSf(
      `pypeline quickdeploy --target-org ${NUT_ORG} --no-prompt`
    );

    expect(exitCode).to.equal(0, `stderr: ${stderr}`);
    // Após sucesso, o prd_job_id.txt deve ter sido removido
    expect(fs.existsSync('prd_job_id.txt')).to.be.false;
  });
});
