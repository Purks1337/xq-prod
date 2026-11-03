import { defineConfig } from 'astro/config';

// Определение base пути:
// - Для ветки dev: /xq-prod/dev
// - Для боевой ветки main (по умолчанию): /xq-prod
const isDev = process.env.GITHUB_REF_NAME === 'dev' || process.env.ASTRO_BASE === '/xq-prod/dev';
const base = isDev ? '/xq-prod/dev' : '/xq-prod';

// https://astro.build/config
export default defineConfig({
  site: 'https://Purks1337.github.io',
  base,
});

