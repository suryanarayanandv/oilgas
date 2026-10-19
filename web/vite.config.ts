import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the build work at any GitHub Pages path (/<repo>/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    // Set by the GitHub workflow (owner/repo) so "Fetch now" can link to the Actions page.
    __REPO__: JSON.stringify(process.env.GITHUB_REPOSITORY ?? ""),
  },
});
