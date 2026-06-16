// @ts-check
import { defineConfig } from 'astro/config';

// MBLabs.pro — static one-pager. Zero server, zero framework runtime.
// Output is pure static HTML/CSS + one bundled, hashed TS engine module.
export default defineConfig({
  site: 'https://mblabs.pro',
  output: 'static',
  compressHTML: true,
  build: {
    inlineStylesheets: 'never',
    assets: 'assets',
  },
  devToolbar: { enabled: false },
});
