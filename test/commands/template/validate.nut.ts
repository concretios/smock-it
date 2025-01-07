//Nut testing for validate command
//Note: Prerequisite 
//Run this below command to connect the Dev hub org 
//example:  $env:TESTKIT_ORG_USERNAME="finaltestingorg@cloud.sc"
import * as path from 'node:path';
import * as fs from 'node:fs';
import { exec } from 'node:child_process';
import { TestSession } from '@salesforce/cli-plugins-testkit';
import { sampleData } from '../../mocks/validateNutTestDataset.js';
describe('TemplateValidate Command', () => {
    let testSession: TestSession;
    let defaultusername: string;
    const testDir = path.join(process.cwd(), 'data_gen/templates');
    const testFile = path.join(testDir, 'testTemplate.json');
    const templateName = 'testTemplate';
    const incorrectTemplateName = 'testTemplate1';

    const updateTemplate = (baseTemplate: object, updates: object): object => {
        const updatedTemplate = JSON.parse(JSON.stringify(baseTemplate));
        Object.assign(updatedTemplate, updates);
        return updatedTemplate;
    };

    // Setup Test Session
    before(async () => {
        testSession = await TestSession.create({
            project: {
                name: 'TestProj1',
            },
            devhubAuthStrategy: 'AUTO',
            scratchOrgs: [
                {
                    edition: 'developer',
                    config: 'config/project-scratch-def.json',
                    setDefault: true,
                    wait: 10,
                },
            ],
        });
        defaultusername = testSession.orgs.get('default')?.username ?? 'defaultUsername';
        // Ensure the template directory and file exist
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(testFile, JSON.stringify(sampleData, null, 2), 'utf8');
       
    });

    // Cleanup Test Session
    after(async () => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
        await testSession?.clean();
    });
    it('[BS_TC_186] Validate the Behavior of the Template validate command with Org User Name of the Org Listed in VS Code', (done) => {
        const command = `sf template validate -t ${templateName} -a ${defaultusername}`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage1 = `Success: Connected to SF Org: ${defaultusername}`;
            const expectedMessage2 = 'Success: SF Connection established.';


            if (!stdout.includes(expectedMessage1)) {
                return done(new Error(`Expected message "${expectedMessage1}" not found in stdout.`));
            }
            if (!stdout.includes(expectedMessage2)) {
                return done(new Error(`Expected message "${expectedMessage2}" not found in stdout.`));
            }
            done();
        });
    });

    it('[BS_TC_177] Validate the behavior when an invalid field is used in fieldsToConsider.', (done) => {
        const command = `sf template validate -t ${templateName} -a ${defaultusername}`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = 'Warning: Fields do not exist or cannot be accessed';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });

    it('[BS_TC_148] Validate the behavior when an invalid object is present in the template.', (done) => {
        const command = `sf template validate -t ${templateName} -a ${defaultusername}`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = 'Warning: SObjects do not exist or cannot be accessed';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });

    it('[BS_TC_147] Validate the behavior of the validate command with an incorrect template name.', (done) => {
        const command = `sf template validate -t ${incorrectTemplateName} -a ${defaultusername}`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = `${incorrectTemplateName} is not present at this path`;
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });

    

    it('[BS_TC_194] Validate the behavior when FieldsToConsider is empty, and Pick-Left-fields is set to false.', (done) => {
        const updatedTemplate = updateTemplate(sampleData, {
            sObjects: [
                {
                    lead: {
                        language: 'en',
                        count: 25,
                        fieldsToExclude: ['cleanstatus', 'jigsaw', 'fax', 'email'],
                        fieldsToConsider: [],
                        pickLeftFields: false,
                    },
                },
            ],
        });
        fs.writeFileSync(testFile, JSON.stringify(updatedTemplate, null, 2), 'utf8');
        const command = `sf template validate -t ${templateName} -a ${defaultusername}`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = `No fields are found to generate data. Make sure to set 'pick-left-fields' to 'true' or add fields to 'fields-to-consider'`;
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });

    it('[BS_TC_146] Validate the behavior of the validate command with correct template name.', (done) => {
        const updatedTemplate = updateTemplate(sampleData, {
            sObjects: [
                {
                    lead: {
                        language: 'en',
                        count: 25,
                        fieldsToExclude: [
                            'cleanstatus',
                            'jigsaw',
                            'fax',
                            'email'
                        ],
                    }
                },
            ],
        });
        fs.writeFileSync(testFile, JSON.stringify(updatedTemplate, null, 2), 'utf8');
        const command = `sf template validate -t ${templateName} -a ${defaultusername}`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = `Successfully validated '${templateName}.json' and no invalid object/fields were found!`;
            if (!stdout.includes(expectedMessage)) {
                return done(new Error(`Expected message "${expectedMessage}" not found in stdout.`));
            }
            done();
        });
    });


});