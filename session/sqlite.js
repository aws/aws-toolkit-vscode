const session = require('express-session')
const sqlite = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);

const db = new sqlite(process.env.SQLITE_DB);
const store = new SqliteStore({
  client: db,
});
const sqliteSessionProvider = session({
  store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
});

module.exports = sqliteSessionProvider;
