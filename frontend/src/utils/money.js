/**
 * Format integer cents as French MAD string.
 * 500000 cents → "5 000,00 MAD"
 */
export function formatMAD(cents) {
  const formatted = (cents / 100)
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u00a0/g, '\u0020'); // normalize non-breaking space → regular space
  return `${formatted} MAD`;
}

/**
 * Compact variant — no decimals.
 * 500000 cents → "5 000 MAD"
 */
export function formatMADShort(cents) {
  const formatted = Math.round(cents / 100)
    .toLocaleString('fr-FR')
    .replace(/\u00a0/g, '\u0020');
  return `${formatted} MAD`;
}

/**
 * Parse a MAD string back to integer cents.
 * "5 000,00 MAD" → 500000
 */
export function parseMAD(str) {
  const clean = String(str)
    .replace(/\s/g, '')
    .replace('MAD', '')
    .replace(',', '.');
  return Math.round(parseFloat(clean) * 100) || 0;
}
