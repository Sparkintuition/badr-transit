const { Router } = require('express');
const db = require('../db/db');
const { requireAuth } = require('../auth/middleware');

const router = Router();
router.use(requireAuth);

// GET /api/suggestions/disbursement-types
router.get('/disbursement-types', (req, res) => {
  const rows = db.prepare(
    'SELECT id, label FROM disbursement_type_suggestions WHERE active = 1 ORDER BY display_order'
  ).all();
  res.json(rows);
});

module.exports = router;
