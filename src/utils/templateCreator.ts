/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable class-methods-use-this */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Define the template strings (kept outside the class for cleanliness)
const DEFAULT_TEMPLATE = 
`{
  "namespaceToExclude": [],
  "outputFormat": ["di"],
  "count": 1,
  "sObjects": [
    {"account": {}},
    {"contact": {}},
    {
      "lead": {
        "count": 5,
        "fieldsToExclude": ["fax", "website"],
        "fieldsToConsider": {
          "email": ["smockit@gmail.com"],
          "phone": ["9090909090","6788899990"]
        },
        "pickLeftFields": true
      }
    }
  ]
}
`;

const SALESPROCESS_TEMPLATE = 
`{
  "namespaceToExclude": [],
  "outputFormat": ["di"],
  "count": 1,
  "sObjects": [
    {
      "Account": {
        "count": 1,
        "fieldsToConsider": {},
        "fieldsToExclude": [],
        "pickLeftFields": true,
        "relatedSObjects": [
          {
            "Contact": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true,
              "relatedSObjects": [
                {
                  "Opportunity": {
                    "count": 1,
                    "fieldsToConsider": {},
                    "fieldsToExclude": [],
                    "pickLeftFields":true,
                    "relatedSObjects": [
                      {
                        "Quote": {
                          "count": 1,
                          "pickLeftFields": true,
                          "fieldsToConsider":{},
                          "fieldsToExclude": []
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
`;

const TASKRAY_TEMPLATE = 
`{
    "namespaceToExclude": [],
    "outputFormat": [
        "di"
    ],
    "count": 1,
    "sObjects": [
        {
            "TASKRAY__Project__c": {
                "count": 1,
                "pickLeftFields": true,
                "fieldsToExclude": [
                    "TASKRAY__trPrincipalVersion__c",
                    "TASKRAY__trForecast__c",
                    "TASKRAY__Status__c",
                    "TASKRAY__trTemplate__c",
                    "TASKRAY__trDraft__c",
                    "TASKRAY__trCompleted__c",
                    "TASKRAY__trOnHold__c"
                ],
                "fieldsToConsider": {},
                "relatedSObjects": [
                    {
                        "TASKRAY__Project_Task__c": {
                            "count": 1,
                            "pickLeftFields": true,
                            "fieldsToExclude": [
                                "TASKRAY__trStartDate__c",
                                "TASKRAY__trActualCompletionDate__c",
                                "TASKRAY__Repeat_End_Date__c",
                                "TASKRAY__Deadline__c",
                                "TASKRAY__trTaskGroup__c",
                                "TASKRAY__Archived__c"
                            ],
                            "fieldsToConsider": {
                                "TASKRAY__trLockDates__c": ["true"]
                            },
                            "relatedSObjects": [
                                {
                                    "TASKRAY__trTaskTime__c": {
                                        "count": 1,
                                        "pickLeftFields": true,
                                        "fieldsToExclude": [
                                            "TASKRAY__Owner__c",
                                            "TASKRAY__trUnsavedTimeEntry__c"
                                        ],
                                        "fieldsToConsider": {},
                                        "relatedSObjects": []
                                    }
                                },
                                {
                                    "TASKRAY__trChecklistGroup__c": {
                                        "count": 1,
                                        "pickLeftFields": true,
                                        "fieldsToExclude": [],
                                        "fieldsToConsider": {},
                                        "relatedSObjects": [
                                            {
                                                "TASKRAY__trChecklistItem__c": {
                                                    "count": 1,
                                                    "pickLeftFields": true,
                                                    "fieldsToExclude": [
                                                        "TASKRAY__trOwner__c",
                                                        "TASKRAY__trGroupId__c"
                                                    ],
                                                    "fieldsToConsider": {}
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
    ]
}
`;

const CPQ_TEMPLATE = 
`{
  "namespaceToExclude": [],
  "outputFormat": [
    "di"
  ],
  "count": 1,
  "sObjects": [
    {
      "Account": {
        "count": 1,
        "fieldsToConsider": {},
        "fieldsToExclude": [],
        "pickLeftFields": true,
        "relatedSObjects": [
          {
            "Contact": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true,
              "relatedSObjects": [
                {
                  "Opportunity": {
                    "count": 1,
                    "fieldsToConsider": {},
                    "fieldsToExclude": [],
                    "pickLeftFields": true,
                    "relatedSObjects": [
                      {
                        "SBQQ__Quote__c": {
                          "count": 1,
                          "fieldsToConsider": {
                            "SBQQ__Primary__c": [
                              "true"
                            ]
                          },
                          "fieldsToExclude": [
                            "SBQQ__SalesRep__c",
                            "SBQQ__MasterEvergreenContract__c"
                          ],
                          "pickLeftFields": true,
                          "relatedSObjects": [
                            {
                              "SBQQ__QuoteLineGroup__c": {
                                "count": 1,
                                "fieldsToConsider": {},
                                "pickLeftFields": true,
                                "fieldsToExclude": [],
                                "relatedSObjects": [
                                  {
                                    "SBQQ__QuoteLine__c": {
                                      "count": 1,
                                      "fieldsToExclude": [
                                        "SBQQ__ContractedPrice__c",
                                        "SBQQ__Dimension__c",
                                        "SBQQ__DiscountTier__c",
                                        "SBQQ__TermDiscountTier__c",
                                        "SBQQ__RenewedAsset__c",
                                        "SBQQ__UpgradedAsset__c"
                                      ],
                                      "fieldsToConsider": {},
                                      "pickLeftFields": true
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "Order": {
                                "count": 1,
                                "fieldsToConsider": {
                                  "SBQQ__Contracted__c": ["false"],
                                  "Status": ["Draft"]
                                },
                                "fieldsToExclude": [
                                  "ContractId",
                                  "OriginalOrderId"
                                ],
                                "pickLeftFields": true,
                                "relatedSObjects": [
                                  {
                                    "OrderItem": {
                                      "count": 1,
                                      "fieldsToConsider": {},
                                      "fieldsToExclude": [
                                        "SBQQ__Asset__c",
                                        "SBQQ__PriceDimension__c",
                                        "SBQQ__OrderedQuantity__c",
                                        "ListPrice"
                                      ],
                                      "pickLeftFields": true
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
`;

const HEALTHCLOUD_TEMPLATE = 
`{
  "namespaceToExclude": [],
  "outputFormat": [
    "di"
  ],
  "count": 1,
  "sObjects": [
    {
      "Account": {
        "count": 1,
        "fieldsToExclude": [
          "BillingCountryCode",
          "BillingStateCode",
          "ShippingCountryCode",
          "ShippingStateCode",
          "PersonMailingCountryCode",
          "PersonMailingCountry",
          "PersonMailingStateCode",
          "PersonOtherCountryCode",
          "PersonOtherCountry",
          "PersonOtherStateCode",
          "PersonSequenceInMultipleBirth",
          "Name",
          "BillingState",
          "ShippingState",
          "PersonMailingState",
          "PersonOtherState"
        ],
        "fieldsToConsider": {},
        "pickLeftFields": true,
        "relatedSObjects": [
          {
            "Opportunity": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [
                "HealthCloudGA__ReferredToUser__c",
                "HealthCloudGA__ReferringUser__c"
              ],
              "pickLeftFields": true,
              "relatedSObjects": []
            }
          },
          {
            "Medication": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true,
              "relatedSObjects": [
                {
                  "MedicationStatement": {
                    "count": 1,
                    "fieldsToConsider": {},
                    "fieldsToExclude": [
                      "MedicationCodeId"
                    ],
                    "pickLeftFields": true,
                    "relatedSObjects": [
                      {
                        "CareObservation": {
                          "count": 1,
                          "pickLeftFields": true,
                          "fieldsToConsider": {},
                          "fieldsToExclude": [
                            "DeviceId"
                          ]
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "CareMetricTarget": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true,
              "relatedSObjects": [
                {
                  "CareObservation": {
                    "count": 1,
                    "fieldsToConsider": {},
                    "pickLeftFields": true,
                    "fieldsToExclude": [
                      "DeviceId"
                    ]
                  }
                }
              ]
            }
          },
          {
            "MedicationRequest": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true
            }
          },
          {
            "AllergyIntolerance": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true
            }
          },
          {
            "HealthCondition": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true
            }
          },
          {
            "ClinicalEncounter": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true
            }
          },
          {
            "PatientImmunization": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true
            }
          },
          {
            "Case": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [],
              "pickLeftFields": true,
              "relatedSObjects": [
                {
                  "CareRequest": {
                    "count": 1,
                    "fieldsToConsider": {},
                    "fieldsToExclude": [
                      "OriginalDenialMedicalDirectorId",
                      "FirstReviewerId",
                      "MedicalDirectorId"
                    ],
                    "pickLeftFields": true
                  }
                }
              ]
            }
          },
          {
            "PatientMedicalProcedure": {
              "count": 1,
              "fieldsToConsider": {},
              "fieldsToExclude": [
                "PerformedAtAgeLowerLimit",
                "PerformedAtAgeUpperLimit",
                "DurationTimeString"
              ],
              "pickLeftFields": true
            }
          }
        ]
      }
    }
  ]
}`;

export class TemplateCreator {

  private getUniqueFilePath(templatePath: string, baseName: string): string {
    let filePath = path.join(templatePath, `${baseName}.json`);
    let counter: number = 0;

    while (fs.existsSync(filePath)) {
      counter++;
      filePath = path.join(templatePath, `${baseName}_${counter}.json`);
    }
    return filePath;
  }

  /**
   * Creates a data template file of the specified type.
   * @param templatePath - The path to the templates directory.
   * @param templateType - The type of template to create ('default', 'salesprocess', taskray , cpq, healthcloud).
   * @returns The path of the created template file.
   */
  public createTemplate(templatePath: string, templateType: 'default' | 'salesprocess' | 'taskray' | 'cpq' | 'healthcloud'): string {
    let baseName: string;
    let templateContent: string;

    switch (templateType) {
      case 'default':
        baseName = 'default_data_template';
        templateContent = DEFAULT_TEMPLATE;
        break;
      case 'salesprocess':
        baseName = 'default_salesprocess_template';
        templateContent = SALESPROCESS_TEMPLATE;
        break;
      case 'taskray':
        baseName = 'default_taskray_template';
        templateContent = TASKRAY_TEMPLATE;
        break;
      case 'cpq':
        baseName = 'default_cpq_template';
        templateContent = CPQ_TEMPLATE;
        break;
      case 'healthcloud':
        baseName = 'default_healthcloud_template';
        templateContent = HEALTHCLOUD_TEMPLATE;
        break;
      default:
        throw new Error(`Unknown template type: ${templateType}`);
    }

    const filePath = this.getUniqueFilePath(templatePath, baseName);
    fs.writeFileSync(filePath, templateContent, 'utf8');
    return filePath;
  }
}