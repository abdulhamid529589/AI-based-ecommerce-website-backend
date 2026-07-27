/**
 * Generate a URL-safe slug from a string.
 * Appends a short random suffix when requested for uniqueness.
 */
export function slugify(text, { unique = false } = {}) {
  const base = String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)

  if (!unique) return base || 'shop'

  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base || 'shop'}-${suffix}`
}
