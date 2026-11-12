import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Определение base пути:
// - Для ветки dev: /xq-prod/dev
// - Для боевой ветки main (по умолчанию): /xq-prod
// - Либо кастомный ASTRO_BASE (например "" для отдельного домена/сервера)
const isDev = process.env.GITHUB_REF_NAME === 'dev' || process.env.ASTRO_BASE === '/xq-prod/dev';
const base = process.env.ASTRO_BASE !== undefined
  ? process.env.ASTRO_BASE
  : (isDev ? '/xq-prod/dev' : '/xq-prod');

// https://astro.build/config
export default defineConfig({
  site: 'https://Purks1337.github.io',
  base,
  adapter: node({
    mode: 'standalone',
  }),
});


