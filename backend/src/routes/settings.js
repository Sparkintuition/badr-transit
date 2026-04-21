const { Router } = require('express');
const db = require('../db/db');
const { requireAuth } = require('../auth/middleware');

const router = Router();

router.get('/next-dossier-number', requireAuth, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'next_dossier_number'").get();
  res.json({ value: row ? row.value : '1000000' });
});

module.exports = router;
