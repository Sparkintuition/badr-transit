const bcrypt = require('bcrypt');
const ROUNDS = 12;

async function hashPassword(plain) { return bcrypt.hash(plain, ROUNDS); }
async function verifyPassword(plain, hash) { return hash ? bcrypt.compare(plain, hash) : false; }
const hashPin = hashPassword;
async function verifyPin(plain, hash) { return hash ? bcrypt.compare(plain, hash) : false; }

function validatePasswordStrength(plain) {
  if (!plain || plain.length < 8) return { ok: false, reason: 'Le mot de passe doit contenir au moins 8 caractères.' };
  if (!/[a-zA-Z]/.test(plain)) return { ok: false, reason: 'Le mot de passe doit contenir au moins une lettre.' };
  if (!/[0-9]/.test(plain)) return { ok: false, reason: 'Le mot de passe doit contenir au moins un chiffre.' };
  return { ok: true };
}

function validatePinFormat(plain) {
  if (!plain || !/^\d{4}$/.test(String(plain))) return { ok: false, reason: 'Le PIN doit contenir exactement 4 chiffres.' };
  return { ok: true };
}

module.exports = { hashPassword, verifyPassword, hashPin, verifyPin, validatePasswordStrength, validatePinFormat };
