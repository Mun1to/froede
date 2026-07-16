import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import froede from "@froede/vite-plugin";

export default defineConfig({
  plugins: [froede(), react()],
});
