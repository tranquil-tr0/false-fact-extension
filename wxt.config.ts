import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    permissions: ['scripting', 'activeTab', 'storage'],
  },
});
