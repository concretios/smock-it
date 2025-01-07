# summary

Upsert the configurations on global/sobject level values

# flags.templateName.summary

Specify the data template name.

# flags.templateName.description

Use `--templateName` or `-t` to specify the name of the data template to be utilized. The template must exist in the `data_gen/templates` directory.

# flags.count.summary

Specify the number of records to generate.

# flags.count.description

Use `--count` or `-c` to set the number of records to generate. If `--sObject` or `-o` is provided, this will only update or remove the count for that individual object.

# flags.namespaceToExclude.summary

Specify namespaces to be excluded during record data generation.

# flags.namespaceToExclude.description

Use `--namespaceToExclude` or `-x` to exclude specific namespaces from generating record data for namespace fields. Multiple namespaces can be specified, separated by commas. This setting applies only at the template level and cannot be defined for individual objects.

# flags.language.summary

Specify the language to generate records. [supports 'en' or 'jp']

# flags.language.description

Use `--language` or `-l` to select the language ('en' or 'jp'). When `--sObject` or `-o` is specified, this will update or remove the language setting for that object.

# flags.outputFormat.summary

Specify the output format(s) for generated data. [supports CSV, JSON, DI (direct insert to connected org)]

# flags.outputFormat.description

Use `--outputFormat` or `-f` to define the output format(s) for generated data. Multiple formats (CSV, JSON, DI) can be specified, separated by commas, and are compatible with Salesforce data transfer interactions.

# flags.sObject.summary

Specify the Object API name to override or remove object-level settings.

# flags.sObject.description

Use `--sObject` or `-o` to target a specific object and override its existing settings. If the specified `--sObject` is not found in the provided data template, an "add object" prompt will appear.

# flags.fieldsToExclude.summary

Specify object fields to exclude from test data generation.

# flags.fieldsToExclude.description

Use `--fieldsToExclude` or `-e` to exclude specific fields from test data generation for a given object. This setting applies only at the object level and cannot be defined at template level.

# flags.fieldsToConsider.summary

Specify object fields to consider(also accepts value(s)) for test data generation.

# flags.fieldsToConsider.description

Use `--fieldsToExclude` or `-i` to consider specific fields(also accepts value(s)) for test data generation for a given object. This setting applies only at the object level and cannot be defined at template level.

# flags.pickLeftFields.summary

The pickLeftFields flag determines which object fields are included in test data generation.

# flags.pickLeftFields.description

Use `--pickLeftFields` or `-p` to specify fields for test data generation. Set to false to include only fieldsToConsider. Set to true to include all fields except those in fieldsToExclude. This setting applies only at the object level and cannot be defined at template level.

# Examples

- `sf template add -t <template-name> <global flags with values -f,-x,-c,-l>`
- `sf template add -t <template-name> -o <object-name> <object flags with values -e,-c,-l>`
