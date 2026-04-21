require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const crypto = require('crypto');

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

const app = express();
const PORT = process.env.PORT || 3000;

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  SESSION_SECRET not set in .env — sessions will reset on server restart');
}

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
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

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/disbursements', disbursementsRouter);
app.use('/api/invoices', invoicesRouter);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
