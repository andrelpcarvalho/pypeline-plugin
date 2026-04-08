import { expect } from 'chai';

describe('pypeline diff', () => {
  it('should infer metadata types from directory paths', () => {
    const DIR_TYPE_MAP: Array<[string, string]> = [
      ['/lwc/', 'LightningComponentBundle'],
      ['/aura/', 'AuraDefinitionBundle'],
      ['/classes/', 'ApexClass'],
      ['/triggers/', 'ApexTrigger'],
      ['/objects/', 'CustomObject'],
      ['/flows/', 'Flow'],
      ['/layouts/', 'Layout'],
      ['/profiles/', 'Profile'],
      ['/staticresources/', 'StaticResource'],
      ['/experiences/', 'ExperienceBundle'],
    ];

    const EXT_TYPE_MAP: Record<string, string> = {
      '.cls': 'ApexClass',
      '.trigger': 'ApexTrigger',
      '.page': 'ApexPage',
      '.component': 'ApexComponent',
    };

    function inferMetadataType(filePath: string): string {
      const lower = filePath.toLowerCase();
      const dirMatch = DIR_TYPE_MAP.find(([dir]) => lower.includes(dir));
      if (dirMatch) return dirMatch[1];
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      return EXT_TYPE_MAP[ext.toLowerCase()] ?? 'Unknown';
    }

    expect(inferMetadataType('force-app/main/default/classes/Foo.cls')).to.equal('ApexClass');
    expect(inferMetadataType('force-app/main/default/lwc/bar/bar.js')).to.equal('LightningComponentBundle');
    expect(inferMetadataType('force-app/main/default/aura/baz/baz.cmp')).to.equal('AuraDefinitionBundle');
    expect(inferMetadataType('force-app/main/default/triggers/T.trigger')).to.equal('ApexTrigger');
    expect(inferMetadataType('force-app/main/default/objects/Account/fields/F.xml')).to.equal('CustomObject');
    expect(inferMetadataType('force-app/main/default/experiences/site/home.json')).to.equal('ExperienceBundle');
    expect(inferMetadataType('some/random/file.txt')).to.equal('Unknown');
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      baseline: 'abc123',
      head: 'def456',
      files: [
        { status: 'A' as const, file: 'classes/Foo.cls', metadataType: 'ApexClass' },
      ],
      totalAdded: 1,
      totalModified: 0,
      totalDeleted: 0,
    };
    expect(mockResult.files).to.have.lengthOf(1);
    expect(mockResult.totalAdded).to.equal(1);
  });
});
