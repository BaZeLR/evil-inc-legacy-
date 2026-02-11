export const VariableDefinitionTemplate = {
  name: '',
  type: 'boolean',
  default: false,
  category: '',
  group: ''
};

export const VariableSchemaTemplate = {
  schemaVersion: 1,
  variables: {
    example_flag: { ...VariableDefinitionTemplate }
  }
};
