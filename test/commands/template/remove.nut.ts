import * as path from 'node:path';
import * as fs from 'node:fs';
import pkg from 'shelljs';
const { exec } = pkg;
describe('TemplateRemove Command', () => {
    const testDir = path.join(process.cwd(), 'data_gen/templates');
    const testFile = path.join(testDir, 'testTemplate.json');
    const verifyCommandOutput = (stdout: string, expectedMessage: string, done: Mocha.Done) => {
        if (!stdout.includes(expectedMessage)) {
            return done(new Error(`Expected message "${expectedMessage}" not found in stdout.`));
        }
        done();
    };
    const templateName = 'testTemplate';
    before(() => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        const sampleData = {
            templateFileName: 'testTemplate.json',
            namespaceToExclude: [
                'namespace1',
                'namespace2',
                'namespace3',
                'namespace8',
                'namespace9',
                'namespace10'
            ],
            outputFormat: [
                'di',
                'csv',
                'xml',
                'json'
            ],
            language: 'en',
            count: 1,
            sObjects: [
                {
                    contact: {
                        language: 'en',
                        count: 25,
                        fieldsToExclude: [
                            'cleanstatus',
                            'jigsaw'
                        ],
                        fieldsToConsider: {
                            "value1": [],
                            "value2": [],
                            "dp-Year": "2023",
                            "dp-Month": "12",
                            "dp-Day": "31"

                        },
                    }
                },
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
                        fieldsToConsider: {
                            "value1": [],
                            "value2": [],
                            "dp-Year": "2023",
                            "dp-Month": "12",
                            "dp-Day": "31"

                        },

                    }
                },
                {
                    account: {
                        language: 'jp',
                        count: 25,
                        fieldsToExclude: [
                            'cleanstatus',
                            'jigsaw'
                        ]
                    }
                },
                {
                    case: {
                        language: 'en',
                        count: 2,
                        fieldsToExclude: [
                            'value1',
                            'value2',
                            'jigsaw'
                        ]
                    }
                }
            ]
        };

        fs.writeFileSync(testFile, JSON.stringify(sampleData, null, 2), 'utf8');
    });
    after(() => {
        // Cleanup: Remove the test file created in the before method
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    it('[BS_TC_171] Validate the behavior when single fields are removed from the FieldsToConsider.', (done) => {
        const command = `sf template remove -t ${templateName} -s lead -i value1`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "Removing 'value1' from the 'fieldsToConsider' of sObject 'lead' settings";
            if (stdout.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_172] Validate the behavior when multiple fields are removed from the FieldsToConsider.', (done) => {
        const command = `sf template remove -t ${templateName} -s contact -i value1,value2`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "Removing 'value1, value2' from the 'fieldsToConsider' of sObject 'contact' settings.";
            if (stdout.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stdout.`));
            }
        });
    });
    it('[BS_TC_173] Validate the behavior when Pick-Left-Fields are removed from the template.', (done) => {
        const command = `sf template remove -t ${templateName} -s lead -p`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "pickLeftFields can not be deleted, it can only be set to true or false using the update command";
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_174] Validate the behavior when dependent picklist fields are removed from the FieldsToConsider.', (done) => {
        const command = `sf template remove -t ${templateName} -s lead -i dp-Year,dp-Month,dp-Day`;
        exec(command, (error, stdout, stderr) => {
            const expectedOutputMessage = "Removing 'dp-Year, dp-Month, dp-Day' from the 'fieldsToConsider' of sObject 'lead' settings.";
            if (stdout.includes(expectedOutputMessage)) {
                done();
            } else {
                done(new Error(`Expected message "${expectedOutputMessage}" not found in stdout.`));
            }
        });
    });
    it('[BS_TC_175] Validate the behavior when the FieldsToConsider section is removed from the template..', (done) => {
        const command = `sf template remove -t ${templateName} -s lead -i`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "Flag --fieldsToConsider expects a value";
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_176] Validate the behavior when an invalid field is provided that does not exist in the fieldsToConsider.', (done) => {
        const command = `sf template remove -t ${templateName} -s lead -i value3`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "Values 'value3' do not exist in the 'fieldsToConsider' of sobject 'lead' settings";
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_128] Verify remove single namespaceToExclude', (done) => {
        const command = `sf template remove -t ${templateName} -x nameSpace1`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }

            const expectedMessage = "Removing 'nameSpace1' from the 'namespaceToExclude' settings."
            if (!stdout.includes(expectedMessage)) {
                return done(new Error(`Expected message "${expectedMessage}" not found in stdout.`));
            }
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_129] Verify removing multiple namespaceToExclude', (done) => {
        const command = `sf template remove -t ${templateName} -x nameSpace9,nameSpace10`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Removing 'nameSpace9, nameSpace10' from the 'namespaceToExclude' settings."
            if (!stdout.includes(expectedMessage)) {
                return done(new Error(`Expected message "${expectedMessage}" not found in stdout.`));
            }
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_143] Validate when object name is Capital and removing the language, count and the fields', (done) => {
        const command = `sf template remove -t ${templateName} -l -c -e email -s Lead`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedLanguageMsg = "Removing 'language' from the sObject 'lead' settings.";
            const expectedCountMsg = "Removing 'count' from the sObject 'lead' settings.";
            const expectedFieldsToExcludeMsg = "Removing 'email' from the 'fieldsToExclude' of sObject 'lead' settings.";
            if (!stdout.includes(expectedCountMsg) || !stdout.includes(expectedLanguageMsg) || !stdout.includes(expectedFieldsToExcludeMsg)) {
                return done(new Error('some of the Expected messages not found in stdout.'));
            }
            done();
        });
    });
    it('[BS_TC_141] Validate removing both the language, count from the sObject', (done) => {
        const command = `sf template remove -t ${templateName} -s contact -l -c`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedLanguageMsg = "Removing 'language' from the sObject 'contact' settings.";
            const expectedCountMsg = "Removing 'count' from the sObject 'contact' settings.";

            if (!stdout.includes(expectedCountMsg) || !stdout.includes(expectedLanguageMsg)) {
                return done(new Error('some of the Expected messages not found in stdout.'));
            }
            done();
        });
    });
    it('[BS_TC_135] Verify error when removing all values from outputFormat', (done) => {
        const command = `sf template remove -t ${templateName} -f di,csv,XML,json`;

        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "All the values from 'output-format' cannot be deleted! You must leave at least one value";
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_184] Verify remove single outputFormat', (done) => {
        const command = `sf template remove -t ${templateName} -f di`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Removing 'di' from the 'outputFormat' settings.";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_191] Verify removing count from sObject', (done) => {
        const command = `sf template remove -t ${templateName} -c -s case`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Removing 'count' from the sObject 'case' settings";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_192] Verify removing language from sObject', (done) => {
        const command = `sf template remove -t ${templateName} -l -s case`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Removing 'language' from the sObject 'case' settings.";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_193] Verify remove fieldsToExclude from specified Object ', (done) => {
        const command = `sf template remove -t ${templateName} -s account -e jigsaw,CLEANSTATUS`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Removing 'jigsaw, CLEANSTATUS' from the 'fieldsToExclude' of sObject 'account' settings.";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_176] Verify error when removing template level count', (done) => {
        const command = `sf template remove -t ${templateName} -c`;

        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = 'Default count can not be deleted! You can update instead.';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_137] Verify error when removing template level language', (done) => {
        const command = `sf template remove -t ${templateName} -l`;

        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = 'Default language can not be deleted! You can update instead.';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('Verify error when removing outputFormat along with sObject', (done) => {
        const command = `sf template remove -t ${templateName} -s contact -f xml`;

        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = 'You cannot use global flag "outputFormat" with an SObject flag.';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('Verify error when removing namespace along with sObject', (done) => {
        const command = `sf template remove -t ${templateName} -s contact -x namespace3`;

        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = 'You cannot use global flag "namespaceToExclude" with an SObject flag.';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_138] Verify removing single Object from the template', (done) => {
        const command = `sf template remove -t ${templateName} -s lead`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Object 'lead' has been removed from the data template file.";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_131] Verify error when removing when removing a template file.', (done) => {
        const command = `sf template remove -t ${templateName}`;
        exec(command, (error, stdout, stderr) => {
            console
            const expectedErrorMessage = 'Data Template File cannot be deleted! You must specify at least one setting flag to remove';
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_139] Verify removing multiple sObjects from the template', (done) => {
        const command = `sf template remove -t ${templateName} -s account,contact`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Object 'account, contact' has been removed from the data template file.";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });
    it('[BS_TC_133] Verify error when removing outputFormat with non-existing values', (done) => {
        const command = `sf template remove -t ${templateName} -f test1, test2`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "Values 'test1,, test2' do not exist in the outputFormat.";
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_132] Verify error when removing fieldsToExclude with non-existing values', (done) => {
        const command = `sf template remove -t ${templateName} -s case -e value3,value4`;
        exec(command, (error, stdout, stderr) => {
            const expectedErrorMessage = "Values 'value3, value4' do not exist in the 'fieldsToExclude' of sobject 'case' settings";
            if (stderr.includes(expectedErrorMessage)) {
                done();
            } else {
                done(new Error(`Expected error message "${expectedErrorMessage}" not found in stderr.`));
            }
        });
    });
    it('[BS_TC_134] Verify remove outputFormat in capital Letter', (done) => {
        const command = `sf template remove -t ${templateName} -f JSON`;
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`exec error: ${JSON.stringify(error)}`);
                return done(error);
            }
            const expectedMessage = "Removing 'JSON' from the 'outputFormat' settings.";
            verifyCommandOutput(stdout, expectedMessage, done);
        });
    });

});
