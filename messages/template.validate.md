# summary

This will validate the SObject and its fields in the given data template from the specified salesforce org.

# flags.templateName.summary

Specify the data template name.

# flags.templateName.description

Use `--templateName` or `-t` to specify the name of the data template to be utilized. The template must exist in the `data_gen/templates` directory.

# flags.alias.summary

Validates the specified template against the given alias or username.

# flags.alias.description

Use `--alias` or `-a` to specify the alias or username to be used for the validation of the template.

# Examples

- `sf template validate --templateName MyTemplate`
- `sf template validate --templateName MyTemplate --alias user@example.com`  
