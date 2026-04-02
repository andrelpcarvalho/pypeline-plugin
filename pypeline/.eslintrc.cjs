module.exports = {
  extends: ['eslint-config-salesforce-typescript', 'plugin:sf-plugin/recommended'],
  root: true,
  parserOptions: {
    project: ['./tsconfig.json'], // apenas isso
  },
  rules: {
    header: 'off',
  },
};
