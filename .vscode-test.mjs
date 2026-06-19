import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: './test/fixtures/sample-project',
  mocha: {
    timeout: 15000,
    retries: 1,
  },
});
