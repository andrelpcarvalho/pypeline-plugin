/**
 * test/unit/config.test.ts
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  readFileTrimmed,
  writeFile,
  fileExists,
  unlinkIfExists,
  gitDiffFiles,
} from '../../src/config.js';
import { FAKE_GIT_DIFF, FAKE_COMMIT_HASH } from '../helpers.js';

describe('config.ts', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  describe('readFileTrimmed', () => {
    it('deve retornar o conteúdo sem espaços nas bordas', () => {
      sandbox.stub(fs, 'readFileSync').returns('  abc123  \n');
      expect(readFileTrimmed('/fake/baseline.txt')).to.equal('abc123');
    });
  });

  describe('writeFile', () => {
    it('deve chamar fs.writeFileSync com os argumentos corretos', () => {
      const stub = sandbox.stub(fs, 'writeFileSync');
      writeFile('/fake/baseline.txt', 'hash123\n');
      expect(stub.calledOnceWith('/fake/baseline.txt', 'hash123\n', 'utf8')).to.equal(true);
    });
  });

  describe('fileExists', () => {
    it('deve retornar true quando o arquivo existe', () => {
      sandbox.stub(fs, 'existsSync').returns(true);
      expect(fileExists('/fake/file.txt')).to.equal(true);
    });

    it('deve retornar false quando o arquivo não existe', () => {
      sandbox.stub(fs, 'existsSync').returns(false);
      expect(fileExists('/fake/file.txt')).to.equal(false);
    });
  });

  describe('unlinkIfExists', () => {
    it('não deve lançar erro se o arquivo não existir', () => {
      sandbox.stub(fs, 'unlinkSync').throws(new Error('ENOENT'));
      expect(() => unlinkIfExists('/fake/file.txt')).to.not.throw();
    });

    it('deve chamar unlinkSync quando o arquivo existe', () => {
      const stub = sandbox.stub(fs, 'unlinkSync');
      unlinkIfExists('/fake/file.txt');
      expect(stub.calledOnce).to.equal(true);
    });
  });

  describe('gitDiffFiles', () => {
    it('deve classificar arquivos em added, modified, deleted e notDeleted', () => {
      sandbox.stub(childProcess, 'execSync').returns(FAKE_GIT_DIFF);
      const result = gitDiffFiles(FAKE_COMMIT_HASH);
      expect(result.notDeleted).to.have.length(2);
      expect(result.added).to.have.length(1);
      expect(result.modified).to.have.length(1);
      expect(result.deleted).to.have.length(1);
    });

    it('deve ignorar linhas vazias no diff', () => {
      sandbox.stub(childProcess, 'execSync').returns('\n\n' + FAKE_GIT_DIFF + '\n\n');
      expect(gitDiffFiles(FAKE_COMMIT_HASH).notDeleted).to.have.length(2);
    });

    it('deve retornar listas vazias se não houver diff', () => {
      sandbox.stub(childProcess, 'execSync').returns('');
      const result = gitDiffFiles(FAKE_COMMIT_HASH);
      expect(result.added).to.deep.equal([]);
      expect(result.modified).to.deep.equal([]);
      expect(result.deleted).to.deep.equal([]);
    });
  });
});
