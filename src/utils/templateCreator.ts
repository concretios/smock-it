// src/utils/templateCreator.ts

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
const DEFAULT_TEMPLATE = `
{
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

const SALESPROCESS_TEMPLATE = `
{
  "namespaceToExclude": [],
  "outputFormat": ["di"],
  "Count": 1,
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
                          "fieldsToExclude": ["AdditionalState"]
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
   * @param templateType - The type of template to create ('default', 'salesprocess').
   * @returns The path of the created template file.
   */
  public createTemplate(templatePath: string, templateType: 'default' | 'salesprocess'): string {
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
      default:
        throw new Error(`Unknown template type: ${templateType}`);
    }

    const filePath = this.getUniqueFilePath(templatePath, baseName);
    fs.writeFileSync(filePath, templateContent, 'utf8');
    return filePath;
  }
}