import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Mobil (APK) derlemesi: sunucusuz, statik tek sayfa uygulama
export default defineConfig({
  tanstackStart: {
    spa: { enabled: true },
  },
});
