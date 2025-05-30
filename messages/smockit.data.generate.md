# summary

Data generate

# description

It Generate the records for the given template sObjects

# flags.name.summary

Description of a flag.

# flags.name.description

More information about a flag. Don't repeat the summary. 

# flags.alias.summary

For getting the alias details

# flags.alias.description

For alias details 
# flags.sObject.summary

summary

# flags.sObject.description

des

# flags.templateName.summary

Template according to which we need to generate data

# flags.templateName.description

Use `--templateName` or `-t` to specify the name of the data template to be utilized for data genration. The template must exist in the `data_gen/templates` directory.

# examples

- `sf data generate -t <template-name> <global flags with values -f,-x,-c,-l>`
- `sf data generate -t <template-name> -o <object-name> <object flags with values -e,-c,-l>`


