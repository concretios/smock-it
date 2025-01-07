import * as path from 'node:path';
import * as fs from 'node:fs';
import pkg from 'shelljs';
import { sampleData } from '../../mocks/nutTestingDataset.js';
const {exec} = pkg;

describe('TemplateUpsert Command', () => {
  const testDir = path.join(process.cwd(), 'data_gen/templates');
  const testFile = path.join(testDir, 'testTemplateUpsert.json');
  const templateName = 'testTemplateUpsert';
  before(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, JSON.stringify(sampleData, null, 2), 'utf8');
  });

  after(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  /* --------------------Global Level Testing-------------------------- */

  it('[BS_TC_113] Verify behavior when executing upsert command without passing template flags', (done) => {
    const command = 'sf template upsert';
    exec(command, (error, stdout, stderr) => {

        const expectedErrorMessage = 'Missing required flag templateName';

        if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });

  it('[BS_TC_114] Validate the behavior of command with all valid flags', (done) => {
    const command = `sf template upsert -t ${templateName} -l en -c 122 -e name -s contact`;
    exec(command, (error, stdout) => {
        if (error) {
            return done(error);
        }
        const commonMsgObjLevel = 'Working on the object level settings for contact';
        const expectedLanguageMsg = "Setting 'language' to: en"
        const expectedCountMsg = "Setting 'count' to: 122";
        const expectedFieldsToExcludeMsg = "Updated 'fieldsToExclude' to: cleanstatus, jigsaw, name";
        if (!stdout.includes(commonMsgObjLevel) || !stdout.includes(expectedLanguageMsg) || !stdout.includes(expectedCountMsg) || !stdout.includes(expectedFieldsToExcludeMsg)) {
            return done(new Error('some of the Expected messages not found in stdout.'));
        }
        done();
    });
});

it('[BS_TC_115] Validate the behavior of the command when an invalid flag is provided', (done) => {
    const command = `sf template upsert -t ${templateName} -w en -c 122 -e name -s contact`;
    exec(command, (error, stdout, stderr) => {

        const expectedErrorMessage = 'Nonexistent flag: -w';

        if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });


  it('[BS_TC_116] Validate the behavior of command just with Flags: 1 template-name 2 and object-name', (done) => {
    const command = `echo y | sf template upsert -t ${templateName} -s lead`;
    exec(command, (error, stdout) => {
        if (error) {
            return done(error);
        }
        const commonMsgObjLevel = 'Working on the object level settings for lead';
        const expectedDecisionMsg = "'lead' does not exists in data template! Do you want to add?(Y/n):";
        if (!stdout.includes(commonMsgObjLevel) || !stdout.includes(expectedDecisionMsg)) {
            return done(new Error('some of the Expected messages not found in stdout.'));
        }
        done();
    });
});

it('[BS_TC_117] Validate the behavior of the upsert command with the capitalized flag.', (done) => {
    const command = `sf template upsert -t ${templateName} -S account -l en -c 2 -e name`;
    exec(command, (error, stdout, stderr) => {

        const expectedErrorMessage = 'Nonexistent flag: -S';

        if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });

  it('[BS_TC_118] Validate the behavior of the command with only the template name and object name, adding extra spaces between the flag and name', (done) => {
    const command = `sf template upsert -t ${templateName} -s contact -l en -c 2 -e  name`;

    exec(command, (error, stdout) => {
        if (error) {
            return done(error);
        }
        const commonMsgObjLevel = 'Working on the object level settings for contact';
        const expectedLanguageMsg = "Setting 'language' to: en"
        const expectedCountMsg = "Setting 'count' to: 2";
        const expectedFieldsToExcludeMsg = "Updated 'fieldsToExclude' to: cleanstatus, jigsaw, name";
        if (!stdout.includes(commonMsgObjLevel) || !stdout.includes(expectedLanguageMsg) || !stdout.includes(expectedCountMsg) || !stdout.includes(expectedFieldsToExcludeMsg)) {
            return done(new Error('some of the Expected messages not found in stdout.'));
        }
        done();
    });
});

it('[BS_TC_119] Validate the behavior when adding multiple fields without using double quotes', (done) => {
    const command = `sf template upsert -t ${templateName} -s account -l en -c 2 -e name phone email`;
    exec(command, (error, stdout, stderr) => {

        const expectedErrorMessage = 'Unexpected arguments: phone, email';
        if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });

  it('[BS_TC_120] Validate the behavior when adding multiple fields using double quotes', (done) => {
    const command = `sf template upsert -t ${templateName} -s contact -l en -c 2 -e "name,email" `;
    exec(command, (error, stdout) => {
        if (error) {
            return done(error);
        }
        const commonMsgObjLevel = 'Working on the object level settings for contact';
        const expectedLanguageMsg = "Setting 'language' to: en"
        const expectedCountMsg = "Setting 'count' to: 2";
        const expectedFieldsToExcludeMsg = "Updated 'fieldsToExclude' to: cleanstatus, jigsaw, name, email";
        if (!stdout.includes(commonMsgObjLevel) || !stdout.includes(expectedLanguageMsg) || !stdout.includes(expectedCountMsg) || !stdout.includes(expectedFieldsToExcludeMsg)) {
            return done(new Error('some of the Expected messages not found in stdout.'));
        }
        done();
    });
  });

  it('[BS_TC_121] Validate the behavior of the command when fields are added without specifying the object name', (done) => {
    const command = `sf template upsert -t ${templateName} -e `;
    exec(command, (error, stdout, stderr) => {
      const expectedErrorMessage = 'Flag --fieldsToExclude expects a value';
      if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });

    it('[BS_TC_124] Verify behavior when executing upsert command without passing template flags', (done) => {
    const command = 'sf template upsert';
    exec(command, (error, stdout, stderr) => {

        const expectedErrorMessage = 'Missing required flag templateName';

        if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });

  it('[BS_TC_126] (Validate the behavior of the command with an incorrect language specifiedon Object Level', (done) => {
    const command = `sf template upsert -t ${templateName} -l rs`;
    exec(command, (error, stdout, stderr) => {
      
      const expectedErrorMessage = 'Invalid language input. supports `en` or `jp` only';

      if (stderr.includes(expectedErrorMessage)) {
        done();
      } else {
        done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
      }
    });
  });

    it('[BS_TC_162] Validate the behavior when the fields are added to the FieldsToExclude', (done) => {
    const command = `sf template upsert -t ${templateName} -s contact -e name`;
    exec(command, (error, stdout) => {
      if (error) {
        return done(error);
      }
      const expectedFieldsToExcludeMsg = "Updated 'fieldsToExclude' to: cleanstatus, jigsaw, name";
      if (!stdout.includes(expectedFieldsToExcludeMsg)) {
        return done(new Error('some of the Expected messages not found in stdout.'));
    }
    done();
    });
  });


  it('[BS_TC_164] Validate the behavior when the fields are provided in the FieldsToConsider.', (done) => {
    const command = `sf template upsert -t ${templateName} -s account -i name `;
    exec(command, (error, stdout) => {
      if (error) {
        return done(error);
      }200
      const expectedFieldsToConsiderMsg = 'Updated \'fieldsToConsider\' to: {"name":[]}';
      if (!stdout.includes(expectedFieldsToConsiderMsg)) {
        return done(new Error('some of the Expected messages not found in stdout.'));
    }
    done();
    });
  });

  it('[BS_TC_165] Validate the behavior when multiple fields are provided in the FieldsToConsider section.', (done) => {
    const command = `sf template upsert -t ${templateName} -s account -i "name, phone" `;
    exec(command, (error, stdout) => {
      if (error) {
        return done(error);
      }
      const expectedFieldsToConsiderMsg = 'Updated \'fieldsToConsider\' to: {"name":[],"phone":[]}';
      if (!stdout.includes(expectedFieldsToConsiderMsg)) {
        return done(new Error('some of the Expected messages not found in stdout.'));
    }
    done();
    });
  });

  it('[BS_TC_166] Validate the behavior when fields with values are provided in the FieldsToConsider.', (done) => {
    const command = `sf template upsert -s account -i "name:[ansh], phone:[123]" -t ${templateName}`;
    exec(command, (error, stdout) => {
      if (error) {
        return done(error);
      }
      const expectedFieldsToConsiderMsg = 'Updated \'fieldsToConsider\' to: {"name":["ansh"],"phone":["123"]}';
      if (!stdout.includes(expectedFieldsToConsiderMsg)) {
        return done(new Error('some of the Expected messages not found in stdout.'));
    }
    done();
    });
  });

  it('[BS_TC_167] Validate the behavior when fields with multiple values are provided in the FieldsToConsider.', (done) => {
    const command = `sf template upsert -s contact -i "phone:[123, 456]" -t ${templateName}`;
    exec(command, (error, stdout) => {
      if (error) {
        return done(error);
      }
      const expectedFieldsToConsiderMsg = 'Updated \'fieldsToConsider\' to: {"phone":["123","456"]}';
      if (!stdout.includes(expectedFieldsToConsiderMsg)) {
        return done(new Error('some of the Expected messages not found in stdout.'));
    }
    done();
    });
  });

  it('[BS_TC_183] Validate the Behavior of the Upsert Command for New Features (Fields to Consider, Pick-left Fields)', (done) => {
    const command = `sf template upsert -t ${templateName} -s contact -i "phone:[123, 456]" -p `;
    exec(command, (error, stdout) => {
      if (error) {
        return done(error);
      }
      const fieldsToConsiderMsg = 'Updated \'fieldsToConsider\' to: {"phone":["123","456"]}';
        const pickLeftFieldsMsg = 'Setting \'pickLeftFields\' to: true';
        if (!stdout.includes(fieldsToConsiderMsg)) {
            return done(new Error('FieldsToConsider message not found in stdout.'));
        }
        if (!stdout.includes(pickLeftFieldsMsg)) {
            return done(new Error('PickLeftFields message not found in stdout.'));
        }
    done();
    });
  });

});
