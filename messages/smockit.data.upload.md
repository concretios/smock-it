# summary

Data generate
# description

This Command help to generate the data of the csc/json to the multiple org.
# flags.name.summary

Description of a flag.

# flags.name.description

More information about a flag. Don't repeat the summary. 
# flags.alias.summary

Validates the specified template against the given alias or username.

# flags.alias.description

Use `--alias` or `-a` to specify the alias or username to be used for the validation of the template.

# flags.sObject.summary

Specify the Object API name for which you want to upload the data.

# flags.sObject.description

Use `--sObject` or `-s` to target a specific object for which you want to upload the data.
# flags.uploadFile.summary

Upload file name according to which we need to upload the given data

# flags.uploadFile.description

Use `--uploadFile` or `-u` to specify the name of the data file to be utilized for data genration. The data file must exist in the `data_gen/output` directory.

# examples

- `sf data upload -u <uploadFile.json> -a <username or alias> -s <sObject>`
- `sf data upload -u <uploadFile.csv> -a <username or alias> -s <sObject>`