export const sampleData = {
            templateFileName: 'testTemplate.json',
            namespaceToExclude: [
                'nameSpace1',
                'nameSpace2',
            ],
            outputFormat: [
                'di',
                'csv',
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
                            "BillingCity": []
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
                    }
                },
                {
                    test: {
                        language: 'jp',
                        count: 25,
                        fieldsToExclude: [
                            'cleanstatus',
                            'jigsaw'
                        ]
                    }
                }
            ]
        };