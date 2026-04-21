// French number-to-words for invoice amounts.
//
// Unit tests (inline):
//   amountToFrenchWords(203800)    → "DEUX MILLE TRENTE-HUIT DIRHAMS"
//   amountToFrenchWords(205050)    → "DEUX MILLE CINQUANTE DIRHAMS ET CINQUANTE CENTIMES"
//   amountToFrenchWords(0)         → "ZÉRO DIRHAM"
//   amountToFrenchWords(100)       → "UN DIRHAM"
//   amountToFrenchWords(100000000) → "UN MILLION DE DIRHAMS"
//   amountToFrenchWords(50)        → "ZÉRO DIRHAM ET CINQUANTE CENTIMES"

const ONES = [
  '', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF',
  'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE',
  'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF',
];
const TENS = ['', '', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE'];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;

  if (tens < 6) {
    if (ones === 0) return TENS[tens];
    if (ones === 1) return TENS[tens] + ' ET UN';
    return TENS[tens] + '-' + ONES[ones];
  }
  if (tens === 6) {
    if (ones === 0) return 'SOIXANTE';
    if (ones === 1) return 'SOIXANTE ET UN';
    return 'SOIXANTE-' + ONES[ones];
  }
  if (tens === 7) {
    if (ones === 1) return 'SOIXANTE ET ONZE';
    return 'SOIXANTE-' + ONES[10 + ones];
  }
  if (tens === 8) {
    if (ones === 0) return 'QUATRE-VINGTS';
    return 'QUATRE-VINGT-' + ONES[ones];
  }
  // tens === 9
  return 'QUATRE-VINGT-' + ONES[10 + ones];
}

function belowThousand(n) {
  if (n === 0) return '';
  if (n < 100) return belowHundred(n);
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  let hundStr = hundreds === 1 ? 'CENT' : ONES[hundreds] + ' CENT';
  if (rem === 0 && hundreds > 1) hundStr += 'S';
  if (rem === 0) return hundStr;
  return hundStr + ' ' + belowHundred(rem);
}

function numberToWords(n) {
  if (n === 0) return 'ZÉRO';
  const parts = [];
  const millions = Math.floor(n / 1_000_000);
  if (millions > 0) {
    parts.push(millions === 1 ? 'UN MILLION' : belowThousand(millions) + ' MILLIONS');
    n -= millions * 1_000_000;
  }
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'MILLE' : belowThousand(thousands) + ' MILLE');
    n -= thousands * 1000;
  }
  if (n > 0) parts.push(belowThousand(n));
  return parts.join(' ');
}

function amountToFrenchWords(cents) {
  cents = Math.max(0, Math.floor(cents));
  const dirhams = Math.floor(cents / 100);
  const centimes = cents % 100;

  let result;
  if (dirhams === 0) {
    result = 'ZÉRO DIRHAM';
  } else if (dirhams === 1) {
    result = 'UN DIRHAM';
  } else {
    const words = numberToWords(dirhams);
    // French grammatical rule: "DE DIRHAMS" after a round million
    const useDe = dirhams >= 1_000_000 && dirhams % 1_000_000 === 0;
    result = words + (useDe ? ' DE DIRHAMS' : ' DIRHAMS');
  }

  if (centimes === 0) return result;
  if (centimes === 1) return result + ' ET UN CENTIME';
  return result + ' ET ' + numberToWords(centimes) + ' CENTIMES';
}

module.exports = { amountToFrenchWords };
