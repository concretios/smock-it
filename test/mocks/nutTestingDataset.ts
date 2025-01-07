export const sampleData = {
    templateFileName: 'testTemplateUpsert.json',
    namespaceToExclude: ['ns1', 'ns2'],
    outputFormat: ['csv', 'di'],
    language: 'en',
    count: 1,
    sObjects: [
      {
        contact: {
          language: 'en',
          count: 25,
          fieldsToExclude: ['cleanstatus', 'jigsaw'],
        },
      },
      {
        account: {
          language: 'en',
          count: 25,
          fieldsToExclude: ['cleanstatus', 'jigsaw'],
        },
      },
    ],
  };
  