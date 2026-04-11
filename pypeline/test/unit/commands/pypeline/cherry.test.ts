import { expect } from 'chai';

describe('pypeline cherry', () => {
  it('should match GMUD tag patterns', () => {
    const pattern = /^GMUD[_-]?\w+$/i;

    expect(pattern.test('GMUD12345')).to.be.true;
    expect(pattern.test('GMUD-12345')).to.be.true;
    expect(pattern.test('GMUD_abc')).to.be.true;
    expect(pattern.test('gmud12345')).to.be.true;
    expect(pattern.test('GMUDxyz123')).to.be.true;

    expect(pattern.test('v1.4.0')).to.be.false;
    expect(pattern.test('release-5')).to.be.false;
    expect(pattern.test('')).to.be.false;
  });

  it('should filter tags by custom prefix', () => {
    const tags = ['CR001', 'CR002', 'GMUD123', 'v1.0.0', 'CR003'];
    const prefix = 'CR';
    const filtered = tags.filter((t) => t.toUpperCase().startsWith(prefix.toUpperCase()));

    expect(filtered).to.deep.equal(['CR001', 'CR002', 'CR003']);
  });

  it('should handle exclude mode correctly', () => {
    const gmuds = [
      { id: 'GMUD12345', files: ['classes/A.cls', 'classes/B.cls'] },
      { id: 'GMUD6789', files: ['classes/C.cls', 'lwc/comp/comp.js'] },
      { id: 'GMUDabcd', files: ['triggers/T.trigger'] },
    ];

    const excludeSet = new Set(['GMUD6789']);
    const selected = gmuds.filter((g) => !excludeSet.has(g.id));
    const excluded = gmuds.filter((g) => excludeSet.has(g.id));

    expect(selected).to.have.lengthOf(2);
    expect(excluded).to.have.lengthOf(1);
    expect(excluded[0].id).to.equal('GMUD6789');

    const filesIncluded = selected.flatMap((g) => g.files);
    expect(filesIncluded).to.include('classes/A.cls');
    expect(filesIncluded).to.not.include('classes/C.cls');
  });

  it('should handle include mode correctly', () => {
    const gmuds = [
      { id: 'GMUD12345', files: ['classes/A.cls'] },
      { id: 'GMUD6789', files: ['classes/C.cls'] },
      { id: 'GMUDabcd', files: ['triggers/T.trigger'] },
    ];

    const includeSet = new Set(['GMUD12345', 'GMUDabcd']);
    const selected = gmuds.filter((g) => includeSet.has(g.id));

    expect(selected).to.have.lengthOf(2);
    const filesIncluded = selected.flatMap((g) => g.files);
    expect(filesIncluded).to.include('classes/A.cls');
    expect(filesIncluded).to.include('triggers/T.trigger');
    expect(filesIncluded).to.not.include('classes/C.cls');
  });

  it('should resolve conflicts in favor of inclusion', () => {
    const included = ['classes/Shared.cls', 'classes/A.cls'];
    const excluded = ['classes/Shared.cls', 'classes/C.cls'];

    const conflicts = included.filter((f) => excluded.includes(f));
    expect(conflicts).to.deep.equal(['classes/Shared.cls']);

    const finalExcluded = excluded.filter((f) => !included.includes(f));
    expect(finalExcluded).to.deep.equal(['classes/C.cls']);
  });

  it('should be case insensitive for GMUD IDs', () => {
    const excludeIds = ['gmud6789', 'GMUDABC'];
    const excludeSet = new Set(excludeIds.map((id) => id.toUpperCase()));

    expect(excludeSet.has('GMUD6789')).to.be.true;
    expect(excludeSet.has('GMUDABC')).to.be.true;
  });

  it('should find previous ref correctly', () => {
    const baseline = 'aaa111';
    const previousGmuds = [
      { commitHash: 'bbb222' },
      { commitHash: 'ccc333' },
    ];

    // Com GMUDs anteriores: usa o último commit
    const ref = previousGmuds.length > 0
      ? previousGmuds[previousGmuds.length - 1].commitHash
      : baseline;
    expect(ref).to.equal('ccc333');

    // Sem GMUDs anteriores: usa o baseline
    const refEmpty = ([] as Array<{ commitHash: string }>).length > 0
      ? 'should-not-reach'
      : baseline;
    expect(refEmpty).to.equal('aaa111');
  });
});
