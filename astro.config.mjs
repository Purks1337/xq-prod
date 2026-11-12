import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// На боевом домене hvalite-media.ru базовый путь корневой ('/')
// При необходимости переопределяется через переменную окружения ASTRO_BASE
const base = process.env.ASTRO_BASE !== undefined
  ? process.env.ASTRO_BASE
  : '/';

const site = process.env.ASTRO_SITE || 'https://hvalite-media.ru';

// https://astro.build/config
export default defineConfig({
  site,
  base,
  adapter: node({
    mode: 'standalone',
  }),
});


