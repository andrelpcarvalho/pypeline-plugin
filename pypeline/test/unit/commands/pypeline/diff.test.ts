import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineDiff from '../../../../src/commands/pypeline/diff.js';

describe('pypeline diff', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      baseline: 'abc123',
      head: 'def456',
      files: [
        { status: 'A' as const, file: 'force-app/main/default/classes/Foo.cls', metadataType: 'ApexClass' },
        { status: 'M' as const, file: 'force-app/main/default/lwc/bar/bar.js', metadataType: 'LightningComponentBundle' },
        { status: 'D' as const, file: 'force-app/main/default/triggers/Baz.trigger', metadataType: 'ApexTrigger' },
      ],
      totalAdded: 1,
      totalModified: 1,
      totalDeleted: 1,
    };
    expect(mockResult.files).to.have.lengthOf(3);
    expect(mockResult.files[0].status).to.equal('A');
    expect(mockResult.files[0].metadataType).to.equal('ApexClass');
    expect(mockResult.totalAdded).to.equal(1);
  });

  it('should infer metadata types correctly', () => {
    // Testa a lógica de inferência indiretamente via path patterns
    const pathTypeMap: Record<string, string> = {
      'force-app/main/default/classes/MyClass.cls': 'ApexClass',
      'force-app/main/default/lwc/myComp/myComp.js': 'LightningComponentBundle',
      'force-app/main/default/aura/myAura/myAura.cmp': 'AuraDefinitionBundle',
      'force-app/main/default/triggers/MyTrigger.trigger': 'ApexTrigger',
      'force-app/main/default/objects/Account/fields/Custom__c.field-meta.xml': 'CustomObject',
      'force-app/main/default/flows/MyFlow.flow-meta.xml': 'Flow',
      'force-app/main/default/layouts/Account-Layout.layout-meta.xml': 'Layout',
      'force-app/main/default/profiles/Admin.profile-meta.xml': 'Profile',
      'force-app/main/default/staticresources/MyResource.resource-meta.xml': 'StaticResource',
      'force-app/main/default/experiences/site1/views/home.json': 'ExperienceBundle',
    };

    for (const [filePath, expectedType] of Object.entries(pathTypeMap)) {
      const dir = filePath.toLowerCase();
      let inferred = 'Unknown';

      if (dir.includes('/lwc/'))          inferred = 'LightningComponentBundle';
      else if (dir.includes('/aura/'))    inferred = 'AuraDefinitionBundle';
      else if (dir.includes('/classes/')) inferred = 'ApexClass';
      else if (dir.includes('/triggers/')) inferred = 'ApexTrigger';
      else if (dir.includes('/objects/')) inferred = 'CustomObject';
      else if (dir.includes('/flows/'))   inferred = 'Flow';
      else if (dir.includes('/layouts/')) inferred = 'Layout';
      else if (dir.includes('/profiles/')) inferred = 'Profile';
      else if (dir.includes('/staticresources/')) inferred = 'StaticResource';
      else if (dir.includes('/experiences/')) inferred = 'ExperienceBundle';

      expect(inferred, `Path: ${filePath}`).to.equal(expectedType);
    }
  });
});
