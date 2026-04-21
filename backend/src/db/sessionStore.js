const { Store } = require('express-session');

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

class SQLiteStore extends Store {
  constructor(db) {
    super();
    this.db = db;
    const timer = setInterval(() => {
      try { db.prepare('DELETE FROM sessions WHERE expired_at < ?').run(Date.now()); } catch {}
    }, 60 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?').get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }

  set(sid, session, cb) {
    try {
      this.db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)').run(
        sid, JSON.stringify(session), Date.now() + TTL_MS
      );
      cb(null);
    } catch (e) { cb(e); }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (e) { cb(e); }
  }

  touch(sid, _session, cb) {
    try {
      this.db.prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?').run(Date.now() + TTL_MS, sid);
      cb(null);
    } catch (e) { cb(e); }
  }
}

module.exports = SQLiteStore;
