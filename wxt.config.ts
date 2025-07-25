import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    permissions: ['tabs', 'scripting', 'activeTab'],
    background: {
      service_worker: 'background.ts', // or 'background.js' if using JS
    },
  },
});
