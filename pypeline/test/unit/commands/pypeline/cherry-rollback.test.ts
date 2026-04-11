import { expect } from 'chai';

describe('pypeline cherry-rollback', () => {
  it('should classify A files for destruction and M files for restore', () => {
    const fileStatus = new Map<string, 'A' | 'M' | 'D'>();
    fileStatus.set('classes/NewClass.cls', 'A');
    fileStatus.set('classes/ExistingClass.cls', 'M');
    fileStatus.set('triggers/OldTrigger.trigger', 'D');

    const filesToDestroy: string[] = [];
    const filesToRestore: string[] = [];

    for (const [file, status] of fileStatus) {
      if (status === 'A') filesToDestroy.push(file);
      else filesToRestore.push(file);
    }

    expect(filesToDestroy).to.deep.equal(['classes/NewClass.cls']);
    expect(filesToRestore).to.have.lengthOf(2);
  });

  it('should keep A status when file is added then modified in same GMUD', () => {
    const fileStatus = new Map<string, 'A' | 'M' | 'D'>();
    fileStatus.set('classes/New.cls', 'A');
    // Second commit modifies same file — but it was added first, so stays A
    if (!fileStatus.has('classes/New.cls')) {
      fileStatus.set('classes/New.cls', 'M');
    }
    expect(fileStatus.get('classes/New.cls')).to.equal('A');
  });

  it('should parse commit count from tag message', () => {
    const parseCount = (msg: string): number => {
      const match = /(\d+)/.exec(msg);
      return match ? parseInt(match[1], 10) : 1;
    };

    expect(parseCount('3')).to.equal(3);
    expect(parseCount('commits: 5')).to.equal(5);
    expect(parseCount('')).to.equal(1);
  });
});
