import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss()],
  build: {
    outDir: "assets",
    emptyOutDir: false,
    sourcemap: mode === "development",
    rollupOptions: {
      input: {
        "scripts-preload.min": "scripts/scripts-preload.js",
        "scripts.min": "scripts/scripts.js",
        "styles.min": "styles/styles.css",
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0]?.endsWith(".css")) {
            const name = assetInfo.names[0].replace(".css", "");
            return `${name}.min.css`;
          }
          return "[name][extname]";
        },
      },
    },
    minify: "terser",
  },
}));
