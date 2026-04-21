const { z } = require('zod');

const iceSchema = z.string().regex(/^\d{15}$/, 'ICE doit contenir exactement 15 chiffres');

const emailSchema = z.string().email('Email invalide').optional().or(z.literal(''));

// Preprocessor: coerce empty string to null
const nullableStr = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : (v ?? null)),
  z.string().nullable().optional()
);

// Format Zod errors as { field: message } map (first error per field)
function zodFieldErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    const field = String(issue.path[0] ?? '_');
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

module.exports = { iceSchema, emailSchema, nullableStr, zodFieldErrors };
