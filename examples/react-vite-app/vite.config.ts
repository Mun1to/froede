import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import froede from "vite-plugin-froede";

export default defineConfig({
  plugins: [froede(), react()],
});
