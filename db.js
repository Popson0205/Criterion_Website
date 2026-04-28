// ============================================================
// db.js — PostgreSQL database layer (Neon / any Postgres)
// Extended with: student_login, notices
// ============================================================
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Schema ────────────────────────────────────────────────────
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        TEXT PRIMARY KEY,
      username  TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      role      TEXT NOT NULL CHECK(role IN ('admin','teacher','bursar')),
      name      TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      "classId"      TEXT NOT NULL,
      "daysAttended" TEXT DEFAULT '',
      passport       TEXT DEFAULT '',
      "createdAt"    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS results (
      id                 TEXT PRIMARY KEY,
      "studentId"        TEXT NOT NULL,
      session            TEXT NOT NULL,
      term               TEXT NOT NULL,
      scores             TEXT NOT NULL DEFAULT '{}',
      "teacherComment"   TEXT DEFAULT '',
      "principalComment" TEXT DEFAULT '',
      "isCreche"         BOOLEAN DEFAULT FALSE,
      "createdAt"        TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE("studentId", session, term)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id               INTEGER PRIMARY KEY DEFAULT 1,
      session          TEXT DEFAULT '2024/2025',
      term             TEXT DEFAULT '1ST TERM',
      "daysInSchool"   TEXT DEFAULT '',
      "resumptionDate" TEXT DEFAULT '',
      "stampImage"     TEXT DEFAULT '',
      "bursarSignature" TEXT DEFAULT '',
      "adminPassword"  TEXT DEFAULT 'admin123'
    );

    CREATE TABLE IF NOT EXISTS share_tokens (
      token       TEXT PRIMARY KEY,
      "studentId" TEXT NOT NULL,
      session     TEXT NOT NULL,
      term        TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id             TEXT PRIMARY KEY,
      receipt_number TEXT UNIQUE NOT NULL,
      "studentId"    TEXT NOT NULL,
      session        TEXT NOT NULL,
      term           TEXT NOT NULL,
      date           TEXT NOT NULL,
      items          TEXT NOT NULL DEFAULT '[]',
      payment_method TEXT DEFAULT '',
      to_balance     TEXT DEFAULT '',
      bursar_name    TEXT DEFAULT '',
      share_token    TEXT DEFAULT '',
      "createdBy"    TEXT NOT NULL,
      "createdAt"    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS applicants (
      id                    TEXT PRIMARY KEY,
      ref_number            TEXT UNIQUE NOT NULL,
      surname               TEXT NOT NULL,
      first_name            TEXT NOT NULL,
      other_name            TEXT DEFAULT '',
      sex                   TEXT DEFAULT '',
      dob                   TEXT DEFAULT '',
      home_address          TEXT DEFAULT '',
      state_of_origin       TEXT DEFAULT '',
      local_govt            TEXT DEFAULT '',
      hometown              TEXT DEFAULT '',
      prev_school_name      TEXT DEFAULT '',
      prev_school_town      TEXT DEFAULT '',
      prev_school_class     TEXT DEFAULT '',
      prev_school_year      TEXT DEFAULT '',
      parent_name           TEXT DEFAULT '',
      parent_relationship   TEXT DEFAULT '',
      parent_office_address TEXT DEFAULT '',
      parent_occupation     TEXT DEFAULT '',
      phone                 TEXT DEFAULT '',
      whatsapp              TEXT DEFAULT '',
      passport              TEXT DEFAULT '',
      status                TEXT DEFAULT 'pending' CHECK(status IN ('pending','admitted','rejected')),
      class_admitted        TEXT DEFAULT '',
      remark                TEXT DEFAULT '',
      "admittedAt"          TIMESTAMPTZ,
      "createdAt"           TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS student_logins (
      id           TEXT PRIMARY KEY,
      "studentId"  TEXT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      student_id   TEXT UNIQUE NOT NULL,
      pin          TEXT NOT NULL,
      "createdAt"  TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notices (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      priority    TEXT DEFAULT 'normal' CHECK(priority IN ('normal','urgent','info')),
      target_role TEXT DEFAULT 'teacher' CHECK(target_role IN ('teacher','all')),
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
    CREATE INDEX IF NOT EXISTS idx_applicants_ref    ON applicants(ref_number);
    CREATE INDEX IF NOT EXISTS idx_notices_role      ON notices(target_role);
    CREATE INDEX IF NOT EXISTS idx_student_logins_sid ON student_logins(student_id);
  `);

  // Seed default admin
  const { rows } = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query(
      "INSERT INTO users (id, username, password, role, name) VALUES ($1,$2,$3,$4,$5)",
      ['admin_1', 'admin', hash, 'admin', 'Administrator']
    );
  }

  // Seed default settings
  const { rows: sRows } = await pool.query("SELECT id FROM settings LIMIT 1");
  if (sRows.length === 0) {
    await pool.query("INSERT INTO settings (id) VALUES (1)");
  }

  // Auto-migrations
  await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS "bursarSignature" TEXT DEFAULT '';`);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check'
        AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
        ALTER TABLE users ADD CONSTRAINT users_role_check
          CHECK (role IN ('admin', 'teacher', 'bursar'));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END$$;
  `).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Users ─────────────────────────────────────────────────────
const Users = {
  findByUsername: async (username) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    return rows[0] || null;
  },
  findById: async (id) => {
    const { rows } = await pool.query('SELECT id,username,role,name FROM users WHERE id=$1', [id]);
    return rows[0] || null;
  },
  list: async () => {
    const { rows } = await pool.query(
      "SELECT id,username,role,name,\"createdAt\" FROM users WHERE role='teacher' ORDER BY name"
    );
    return rows;
  },
  listBursars: async () => {
    const { rows } = await pool.query(
      "SELECT id,username,role,name,\"createdAt\" FROM users WHERE role='bursar' ORDER BY name"
    );
    return rows;
  },
  create: async ({ username, password, name }) => {
    const hash = bcrypt.hashSync(password, 10);
    const id   = 'usr_' + uid();
    await pool.query(
      "INSERT INTO users (id,username,password,role,name) VALUES ($1,$2,$3,'teacher',$4)",
      [id, username, hash, name || username]
    );
    return { id, username, role: 'teacher', name: name || username };
  },
  createBursar: async ({ username, password, name }) => {
    const hash = bcrypt.hashSync(password, 10);
    const id   = 'usr_' + uid();
    await pool.query(
      "INSERT INTO users (id,username,password,role,name) VALUES ($1,$2,$3,'bursar',$4)",
      [id, username, hash, name || username]
    );
    return { id, username, role: 'bursar', name: name || username };
  },
  update: async (id, { username, password, name }) => {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await pool.query(
        "UPDATE users SET username=$1,password=$2,name=$3 WHERE id=$4 AND role='teacher'",
        [username, hash, name, id]
      );
    } else {
      await pool.query(
        "UPDATE users SET username=$1,name=$2 WHERE id=$3 AND role='teacher'",
        [username, name, id]
      );
    }
  },
  updateBursar: async (id, { username, password, name }) => {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await pool.query(
        "UPDATE users SET username=$1,password=$2,name=$3 WHERE id=$4 AND role='bursar'",
        [username, hash, name, id]
      );
    } else {
      await pool.query(
        "UPDATE users SET username=$1,name=$2 WHERE id=$3 AND role='bursar'",
        [username, name, id]
      );
    }
  },
  delete: async (id) => {
    await pool.query("DELETE FROM users WHERE id=$1 AND role='teacher'", [id]);
  },
  deleteBursar: async (id) => {
    await pool.query("DELETE FROM users WHERE id=$1 AND role='bursar'", [id]);
  },
  verifyPassword: (user, password) => bcrypt.compareSync(password, user.password),
};

// ── Students ──────────────────────────────────────────────────
const Students = {
  list: async () => {
    const { rows } = await pool.query('SELECT * FROM students ORDER BY "classId", name');
    return rows;
  },
  get: async (id) => {
    const { rows } = await pool.query('SELECT * FROM students WHERE id=$1', [id]);
    return rows[0] || null;
  },
  save: async (student) => {
    await pool.query(`
      INSERT INTO students (id, name, "classId", "daysAttended", passport)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE
        SET name=$2, "classId"=$3, "daysAttended"=$4, passport=$5
    `, [
      student.id || 'stu_' + uid(),
      student.name,
      student.classId,
      student.daysAttended || '',
      student.passport || '',
    ]);
  },
  delete: async (id) => {
    await pool.query('DELETE FROM students WHERE id=$1', [id]);
  },
  bulkInsert: async (students) => {
    for (const s of students) {
      await pool.query(`
        INSERT INTO students (id, name, "classId", "daysAttended", passport)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE
          SET name=$2, "classId"=$3, "daysAttended"=$4, passport=$5
      `, [s.id || 'stu_' + uid(), s.name, s.classId, s.daysAttended || '', s.passport || '']);
    }
  },
};

// ── Results ───────────────────────────────────────────────────
const Results = {
  list: async () => {
    const { rows } = await pool.query('SELECT * FROM results');
    return rows.map(r => ({ ...r, scores: JSON.parse(r.scores), isCreche: !!r.isCreche }));
  },
  get: async (studentId, session, term) => {
    const { rows } = await pool.query(
      'SELECT * FROM results WHERE "studentId"=$1 AND session=$2 AND term=$3',
      [studentId, session, term]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...r, scores: JSON.parse(r.scores), isCreche: !!r.isCreche };
  },
  listByStudent: async (studentId) => {
    const { rows } = await pool.query(
      'SELECT * FROM results WHERE "studentId"=$1 ORDER BY session DESC, term ASC',
      [studentId]
    );
    return rows.map(r => ({ ...r, scores: JSON.parse(r.scores), isCreche: !!r.isCreche }));
  },
  save: async (result) => {
    const scores = JSON.stringify(result.scores || {});
    await pool.query(`
      INSERT INTO results (id, "studentId", session, term, scores, "teacherComment", "principalComment", "isCreche")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT ("studentId", session, term) DO UPDATE
        SET scores=$5, "teacherComment"=$6, "principalComment"=$7, "isCreche"=$8, "updatedAt"=NOW()
    `, [
      'res_' + uid(),
      result.studentId,
      result.session,
      result.term,
      scores,
      result.teacherComment || '',
      result.principalComment || '',
      result.isCreche || false,
    ]);
  },
  delete: async (studentId) => {
    await pool.query('DELETE FROM results WHERE "studentId"=$1', [studentId]);
  },
  bulkInsert: async (results) => {
    for (const r of results) {
      await pool.query(`
        INSERT INTO results (id, "studentId", session, term, scores, "teacherComment", "principalComment", "isCreche")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT ("studentId", session, term) DO UPDATE
          SET scores=$5, "teacherComment"=$6, "principalComment"=$7, "isCreche"=$8, "updatedAt"=NOW()
      `, [
        'res_' + uid(),
        r.studentId, r.session, r.term,
        JSON.stringify(r.scores || {}),
        r.teacherComment || '', r.principalComment || '', r.isCreche || false,
      ]);
    }
  },
};

// ── Settings ──────────────────────────────────────────────────
const Settings = {
  get: async () => {
    const { rows } = await pool.query('SELECT * FROM settings WHERE id=1');
    return rows[0] || {};
  },
  save: async (s) => {
    await pool.query(`
      UPDATE settings
      SET session=$1, term=$2, "daysInSchool"=$3, "resumptionDate"=$4,
          "stampImage"=$5, "adminPassword"=$6, "bursarSignature"=$7
      WHERE id=1
    `, [s.session, s.term, s.daysInSchool || '', s.resumptionDate || '',
        s.stampImage || '', s.adminPassword || 'admin123', s.bursarSignature || '']);
    if (s.adminPassword) {
      const hash = bcrypt.hashSync(s.adminPassword, 10);
      await pool.query("UPDATE users SET password=$1 WHERE role='admin'", [hash]);
    }
  },
};

// ── Share Tokens ──────────────────────────────────────────────
const ShareTokens = {
  create: async (studentId, session, term) => {
    const token = uid() + uid();
    await pool.query(`
      INSERT INTO share_tokens (token, "studentId", session, term)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (token) DO NOTHING
    `, [token, studentId, session, term]);
    return token;
  },
  get: async (token) => {
    const { rows } = await pool.query('SELECT * FROM share_tokens WHERE token=$1', [token]);
    return rows[0] || null;
  },
};

// ── Receipts ──────────────────────────────────────────────────
const Receipts = {
  async getNextNumber(session) {
    const year = session ? session.split('/')[0] : new Date().getFullYear().toString();
    const { rows } = await pool.query(
      `SELECT receipt_number FROM receipts WHERE receipt_number LIKE $1 ORDER BY receipt_number DESC LIMIT 1`,
      [`RCP-${year}-%`]
    );
    if (rows.length === 0) return `RCP-${year}-0001`;
    const last = rows[0].receipt_number;
    const seq  = parseInt(last.split('-')[2], 10) + 1;
    return `RCP-${year}-${String(seq).padStart(4, '0')}`;
  },
  async create({ studentId, session, term, date, items, payment_method, to_balance, bursar_name, createdBy }) {
    const id             = 'rcp_' + uid();
    const receipt_number = await Receipts.getNextNumber(session);
    await pool.query(
      `INSERT INTO receipts (id, receipt_number, "studentId", session, term, date, items, payment_method, to_balance, bursar_name, "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, receipt_number, studentId, session, term, date,
       JSON.stringify(items), payment_method || '', to_balance || '', bursar_name || '', createdBy]
    );
    return Receipts.get(id);
  },
  async list() {
    const { rows } = await pool.query(
      `SELECT r.*, s.name as "studentName", s."classId", s.passport
       FROM receipts r LEFT JOIN students s ON s.id = r."studentId"
       ORDER BY r."createdAt" DESC`
    );
    return rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  },
  async get(id) {
    const { rows } = await pool.query(
      `SELECT r.*, s.name as "studentName", s."classId", s.passport,
              (SELECT "stampImage" FROM settings WHERE id=1) as "stampImage",
              (SELECT "bursarSignature" FROM settings WHERE id=1) as "bursarSignature"
       FROM receipts r LEFT JOIN students s ON s.id = r."studentId"
       WHERE r.id = $1`, [id]
    );
    if (!rows[0]) return null;
    return { ...rows[0], items: JSON.parse(rows[0].items || '[]') };
  },
  async getByToken(token) {
    const { rows } = await pool.query(
      `SELECT r.*, s.name as "studentName", s."classId", s.passport,
              (SELECT "stampImage" FROM settings WHERE id=1) as "stampImage",
              (SELECT "bursarSignature" FROM settings WHERE id=1) as "bursarSignature"
       FROM receipts r LEFT JOIN students s ON s.id = r."studentId"
       WHERE r.share_token = $1`, [token]
    );
    if (!rows[0]) return null;
    return { ...rows[0], items: JSON.parse(rows[0].items || '[]') };
  },
  async generateToken(id) {
    const token = uid() + uid();
    await pool.query(`UPDATE receipts SET share_token = $1 WHERE id = $2`, [token, id]);
    return token;
  },
  async delete(id) {
    await pool.query(`DELETE FROM receipts WHERE id = $1`, [id]);
  },
};

// ── Applicants ────────────────────────────────────────────────
const Applicants = {
  async _nextRef() {
    const year = new Date().getFullYear();
    const { rows } = await pool.query(
      `SELECT ref_number FROM applicants WHERE ref_number LIKE $1 ORDER BY ref_number DESC LIMIT 1`,
      [`CC-${year}-%`]
    );
    if (rows.length === 0) return `CC-${year}-0001`;
    const last = rows[0].ref_number;
    const seq  = parseInt(last.split('-')[2], 10) + 1;
    return `CC-${year}-${String(seq).padStart(4, '0')}`;
  },
  async apply(data) {
    const id         = 'app_' + uid();
    const ref_number = await Applicants._nextRef();
    await pool.query(`
      INSERT INTO applicants
        (id, ref_number, surname, first_name, other_name, sex, dob,
         home_address, state_of_origin, local_govt, hometown,
         prev_school_name, prev_school_town, prev_school_class, prev_school_year,
         parent_name, parent_relationship, parent_office_address, parent_occupation,
         phone, whatsapp, passport)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    `, [
      id, ref_number,
      data.surname, data.firstName, data.otherName || '',
      data.sex || '', data.dob || '',
      data.homeAddress || '', data.stateOfOrigin || '',
      data.localGovt || '', data.hometown || '',
      data.prevSchoolName || '', data.prevSchoolTown || '',
      data.prevSchoolClass || '', data.prevSchoolYear || '',
      data.parentName || '', data.parentRelationship || '',
      data.parentOfficeAddress || '', data.parentOccupation || '',
      data.phone || '', data.whatsapp || '',
      data.passport || '',
    ]);
    return { id, ref_number };
  },
  async list() {
    const { rows } = await pool.query(`SELECT * FROM applicants ORDER BY "createdAt" DESC`);
    return rows;
  },
  async get(id) {
    const { rows } = await pool.query(`SELECT * FROM applicants WHERE id=$1`, [id]);
    return rows[0] || null;
  },
  async getByRef(ref) {
    const { rows } = await pool.query(`SELECT * FROM applicants WHERE ref_number=$1`, [ref]);
    return rows[0] || null;
  },
  async updateStatus(id, { status, classAdmitted, remark }) {
    const admittedAt = status === 'admitted' ? new Date().toISOString() : null;
    await pool.query(`
      UPDATE applicants SET status=$1, class_admitted=$2, remark=$3, "admittedAt"=$4 WHERE id=$5
    `, [status, classAdmitted || '', remark || '', admittedAt, id]);
    return Applicants.get(id);
  },
  async promoteToStudent(id) {
    const app = await Applicants.get(id);
    if (!app || app.status !== 'admitted') throw new Error('Applicant not admitted');
    const studentId = 'stu_' + uid();
    const fullName  = [app.surname, app.first_name, app.other_name].filter(Boolean).join(' ');
    await pool.query(`
      INSERT INTO students (id, name, "classId", "daysAttended", passport)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING
    `, [studentId, fullName, app.class_admitted, '', app.passport || '']);
    return { studentId, name: fullName, classId: app.class_admitted };
  },
  async delete(id) {
    await pool.query(`DELETE FROM applicants WHERE id=$1`, [id]);
  },
};

// ── Student Logins ────────────────────────────────────────────
const StudentLogins = {
  async create(studentId, studentIdCode, pin) {
    const id   = 'sl_' + uid();
    const hash = bcrypt.hashSync(pin, 10);
    await pool.query(`
      INSERT INTO student_logins (id, "studentId", student_id, pin)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT ("studentId") DO UPDATE SET student_id=$3, pin=$4, "updatedAt"=NOW()
    `, [id, studentId, studentIdCode.toUpperCase(), hash]);
    return { studentId, studentIdCode: studentIdCode.toUpperCase() };
  },
  async findByStudentId(studentIdCode) {
    const { rows } = await pool.query(
      `SELECT sl.*, s.name, s."classId", s.passport, s.id as "studentDbId"
       FROM student_logins sl
       JOIN students s ON s.id = sl."studentId"
       WHERE sl.student_id = $1`,
      [studentIdCode.toUpperCase()]
    );
    return rows[0] || null;
  },
  async verifyPin(record, pin) {
    return bcrypt.compareSync(pin, record.pin);
  },
  async delete(studentId) {
    await pool.query(`DELETE FROM student_logins WHERE "studentId"=$1`, [studentId]);
  },
  async listAll() {
    const { rows } = await pool.query(`
      SELECT sl.student_id, sl."studentId", sl."createdAt", sl."updatedAt",
             s.name, s."classId"
      FROM student_logins sl
      JOIN students s ON s.id = sl."studentId"
      ORDER BY s."classId", s.name
    `);
    return rows;
  },
};

// ── Notices ───────────────────────────────────────────────────
const Notices = {
  async list(targetRole) {
    const { rows } = await pool.query(
      `SELECT n.*, u.name as "authorName"
       FROM notices n
       LEFT JOIN users u ON u.id = n."createdBy"
       WHERE n.target_role = $1 OR n.target_role = 'all'
       ORDER BY n."createdAt" DESC`,
      [targetRole || 'teacher']
    );
    return rows;
  },
  async listAll() {
    const { rows } = await pool.query(
      `SELECT n.*, u.name as "authorName"
       FROM notices n
       LEFT JOIN users u ON u.id = n."createdBy"
       ORDER BY n."createdAt" DESC`
    );
    return rows;
  },
  async create({ title, body, priority, targetRole, createdBy }) {
    const id = 'ntc_' + uid();
    await pool.query(`
      INSERT INTO notices (id, title, body, priority, target_role, "createdBy")
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [id, title, body, priority || 'normal', targetRole || 'teacher', createdBy]);
    return Notices.get(id);
  },
  async get(id) {
    const { rows } = await pool.query(
      `SELECT n.*, u.name as "authorName"
       FROM notices n LEFT JOIN users u ON u.id = n."createdBy"
       WHERE n.id = $1`, [id]
    );
    return rows[0] || null;
  },
  async update(id, { title, body, priority }) {
    await pool.query(`
      UPDATE notices SET title=$1, body=$2, priority=$3, "updatedAt"=NOW() WHERE id=$4
    `, [title, body, priority || 'normal', id]);
    return Notices.get(id);
  },
  async delete(id) {
    await pool.query(`DELETE FROM notices WHERE id=$1`, [id]);
  },
};

module.exports = {
  pool, initSchema, uid,
  Users, Students, Results, Settings,
  ShareTokens, Receipts, Applicants,
  StudentLogins, Notices,
};
