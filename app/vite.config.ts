import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Einsatzbericht PWA",
        short_name: "Einsatzbericht",
        description: "Digitaler Einsatzbericht für Messtechniker",
        theme_color: "#0c2a4d",
        background_color: "#f2f6fb",
        display: "standalone",
        start_url: "/",
        lang: "de",
        icons: [
          {
            src: "icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml"
          },
          {
            src: "icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml"
          }
        ]
      }
    })
  ],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"]
  }
});
