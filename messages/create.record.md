# summary

Create Records

# flags.alias.summary

For getting the alias details

# flags.alias.description

only for des
# flags.required-fields.summary
Only Populate Required Fields

# flags.required-fields.description
Only Populate Required Fields

# flags.include-files.description
Use `--templateName` or `-t` to specify the name of the data template to be utilized for data genration. The template must exist in the `data_gen/templates` directory.

# flags.include-files.summary
Speciy file path for upload files

# flags.templateName.summary

Template according to which we need to generate data

# flags.templateName.description

Use `-f` to specify the path of file.

# Examples

- `sf create record -t <template-name> <global flags with values -f,-x,-c,-l>`
- `sf create create -t <template-name> -o <object-name> <object flags with values -e,-c,-l>`