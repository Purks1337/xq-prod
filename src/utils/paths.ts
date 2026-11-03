/**
 * Вспомогательная функция для корректных путей к ассетам из public/
 * с учетом base URL (например, при развертывании на GitHub Pages в подпапку /xq-prod/)
 */
export function getAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
