import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = "http://127.0.0.1:8768"; // brand.PORT

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5175,
    proxy: { "/api": backend, "/auth": backend },
  },
});
