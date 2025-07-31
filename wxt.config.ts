import { defineConfig } from "wxt";

export default defineConfig({
  name: 'False Fact'
  modules: ["@wxt-dev/auto-icons"],
  autoIcons: {
    grayscaleOnDevelopment: false,
  },
  manifest: {
    permissions: ["scripting", "activeTab", "storage"],
  },
});
