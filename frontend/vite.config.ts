import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = "http://127.0.0.1:8768"; // brand.PORT

export default defineConfig({
  plugins: [react()],
  // Plotly (~1 MB) is its own chunk, loaded only on the Year and Compare pages
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    host: "localhost",
    port: 5175,
    proxy: { "/api": backend, "/auth": backend },
  },
});
