require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

require('./db/migrate');
const db = require('./db/db');
const SQLiteStore = require('./db/sessionStore');
const { attachUser } = require('./auth/middleware');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const suggestionsRouter = require('./routes/suggestions');
const clientsRouter = require('./routes/clients');
const jobsRouter = require('./routes/jobs');
const settingsRouter = require('./routes/settings');
const disbursementsRouter = require('./routes/disbursements');
const invoicesRouter = require('./routes/invoices');
const auditRouter = require('./routes/audit');
const adminRouter = require('./routes/admin');
const commisAgentsRouter = require('./routes/commis-agents');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === 'true';

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  SESSION_SECRET not set in .env — sessions will reset on server restart');
}

// CORS only needed in dev (separate Vite dev server on :5173)
if (!isProd) {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

app.use(express.json());

app.use(session({
  store: new SQLiteStore(db),
  name: 'badr.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

app.use(attachUser);

// API routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/disbursements', disbursementsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/audit-log', auditRouter);
app.use('/api/admin', adminRouter);
app.use('/api/commis-agents', commisAgentsRouter);

// In production: serve the built React app
if (isProd) {
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  // Catch-all: return index.html for any non-API route (React Router deep links)
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
