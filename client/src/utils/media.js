export const DEFAULT_CATEGORY_IMAGE = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80';

export function resolveMediaUrl(url) {
  if (!url) return DEFAULT_CATEGORY_IMAGE;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;

  const defaultApiBase = 'http://localhost:5000/api';
  let apiBase = defaultApiBase;

  try {
    const viteApiUrl = typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_API_URL
      : undefined;

    if (viteApiUrl) {
      apiBase = viteApiUrl;
    }
  } catch {
    // ignore environment lookup issues and fall back to localhost in local/test runs
  }

  return `${apiBase.replace(/\/api$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
}
