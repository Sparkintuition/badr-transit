function toCents(mad) {
  if (mad === null || mad === undefined || mad === '') return 0;
  const str = String(mad)
    .replace(/\s/g, '')
    .replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents) {
  if (!cents) return 0;
  return cents / 100;
}

function formatMAD(cents) {
  if (!cents) return '0,00 MAD';
  const num = cents / 100;
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return parts.join(',') + ' MAD';
}

function parseMAD(str) {
  if (!str) return 0;
  const cleaned = String(str)
    .replace(' MAD', '')
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

module.exports = { toCents, fromCents, formatMAD, parseMAD };
