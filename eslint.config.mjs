import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  {
    files: ['scripts/**/*.js', 'test/setup.js', 'vitest.config.js'],
    languageOptions: { globals: globals.node },
  },
];
