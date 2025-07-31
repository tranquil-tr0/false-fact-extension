import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/auto-icons"],
  autoIcons: {
    grayscaleOnDevelopment: false,
  },
  manifest: {
    name: "False Fact",
    permissions: ["scripting", "activeTab", "storage"],
  },
});
