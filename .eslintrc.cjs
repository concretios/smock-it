module.exports = {
  extends: ['eslint-config-salesforce-typescript', 'plugin:sf-plugin/recommended'],
  root: true,
  rules: {
    header: 'off',
    'no-console': 'off',
    complexity: 'off',
    'no-await-in-loop': 'off',
  },
};
