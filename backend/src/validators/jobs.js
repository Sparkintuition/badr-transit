const { z } = require('zod');
const { nullableStr } = require('../utils/validators');

const dateOrNull = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : (v ?? null)),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)').nullable().optional()
);

const nullableId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable().optional()
);

const nullableStr100 = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : (typeof v === 'string' ? v.trim() : (v ?? null))),
  z.string().max(100).nullable().optional()
);

const jobBodySchema = z.object({
  type: z.enum(['import', 'export'], { required_error: 'Le type est requis' }),
  client_id: z.coerce.number({ required_error: 'Le client est requis' }).int().positive('Client invalide'),
  commis_user_id: nullableId,      // legacy field — kept for backward compat
  commis_agent_id: nullableId,     // legacy FK — accepted but ignored for new jobs
  commis_name: nullableStr100,     // free-text commis name (new approach)
  declarant_user_id: nullableId,   // office owner (logistics user with login)
  dossier_number: nullableStr,
  inspecteur: nullableStr,
  recu_le: dateOrNull,
  expediteur_exportateur: nullableStr,
  nombre_colis_tc: nullableStr,
  poids_brut_kg: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().optional()
  ),
  nature_marchandise: nullableStr,
  bureau: nullableStr,
  depot_sequence_date: dateOrNull,
  arrival_date: dateOrNull,
  compagnie_transport: nullableStr,
  observations: nullableStr,
  dums: z.array(z.object({
    dum_number: z.string().min(1, 'Numéro DUM requis'),
    dum_date: dateOrNull,
  })).optional().default([]),
});

// PUT cannot change type, dums, or declarant_user_id (use dedicated endpoints)
const jobUpdateSchema = jobBodySchema.omit({ type: true, dums: true, declarant_user_id: true });

const dumSchema = z.object({
  dum_number: z.string().min(1, 'Numéro DUM requis'),
  dum_date: dateOrNull,
});

const milestoneUpdateSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed', 'skipped']),
  notes: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : (v ?? null)),
    z.string().nullable().optional()
  ),
});

module.exports = { jobBodySchema, jobUpdateSchema, dumSchema, milestoneUpdateSchema };
