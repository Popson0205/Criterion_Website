// ============================================================
// server.js — Criterion College Express API
// Extended: student login, notices, admission routes
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const {
  pool, initSchema, uid,
  Users, Students, Results, Settings,
  ShareTokens, Receipts, Applicants,
  StudentLogins, Notices,
} = require('./db');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'criterion-secret-change-in-production';

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : true; // allow all in dev

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

function requireBursar(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'bursar')
      return res.status(403).json({ error: 'Admin or Bursar only' });
    next();
  });
}

function requireStaff(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'teacher', 'bursar'].includes(req.user.role))
      return res.status(403).json({ error: 'Staff only' });
    next();
  });
}

function requireStudent(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student only' });
    next();
  });
}

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── STAFF LOGIN ───────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Users.findByUsername(username);
    if (!user || !Users.verifyPassword(user, password))
      return res.status(401).json({ error: 'Invalid username or password' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      SECRET, { expiresIn: '12h' }
    );
    res.json({ token, role: user.role, name: user.name, username: user.username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STUDENT LOGIN ─────────────────────────────────────────────
app.post('/api/student-login', async (req, res) => {
  try {
    const { studentId, pin } = req.body;
    if (!studentId || !pin) return res.status(400).json({ error: 'Student ID and PIN required' });
    const record = await StudentLogins.findByStudentId(studentId);
    if (!record) return res.status(401).json({ error: 'Student ID not found' });
    const valid = await StudentLogins.verifyPin(record, pin);
    if (!valid) return res.status(401).json({ error: 'Incorrect PIN' });
    const token = jwt.sign(
      { id: record.studentDbId, studentId: record.student_id, role: 'student', name: record.name, classId: record.classId },
      SECRET, { expiresIn: '12h' }
    );
    res.json({ token, role: 'student', name: record.name, studentId: record.student_id, classId: record.classId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STUDENT PORTAL ────────────────────────────────────────────
app.get('/api/student/profile', requireStudent, async (req, res) => {
  try {
    const student = await Students.get(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ ...student, studentId: req.user.studentId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/student/results', requireStudent, async (req, res) => {
  try {
    const results = await Results.listByStudent(req.user.id);
    const settings = await Settings.get();
    res.json({ results, currentSession: settings.session, currentTerm: settings.term });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/student/results/:session/:term', requireStudent, async (req, res) => {
  try {
    const { session, term } = req.params;
    const result  = await Results.get(req.user.id, decodeURIComponent(session), decodeURIComponent(term));
    const student = await Students.get(req.user.id);
    const settings = await Settings.get();
    if (!result) return res.status(404).json({ error: 'Result not found' });
    res.json({ result, student, settings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN: Student Login Management ──────────────────────────
app.get('/api/student-logins', requireAdmin, async (req, res) => {
  try { res.json(await StudentLogins.listAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/student-logins', requireAdmin, async (req, res) => {
  try {
    const { studentId, studentIdCode, pin } = req.body;
    if (!studentId || !studentIdCode || !pin)
      return res.status(400).json({ error: 'studentId, studentIdCode and pin are required' });
    const result = await StudentLogins.create(studentId, studentIdCode, pin);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/student-logins/:studentId', requireAdmin, async (req, res) => {
  try {
    await StudentLogins.delete(req.params.studentId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NOTICES ───────────────────────────────────────────────────
// Admin: full CRUD
app.get('/api/notices/all', requireAdmin, async (req, res) => {
  try { res.json(await Notices.listAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notices', requireAdmin, async (req, res) => {
  try {
    const { title, body, priority, targetRole } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const notice = await Notices.create({ title, body, priority, targetRole, createdBy: req.user.id });
    res.json(notice);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notices/:id', requireAdmin, async (req, res) => {
  try {
    const notice = await Notices.update(req.params.id, req.body);
    res.json(notice);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notices/:id', requireAdmin, async (req, res) => {
  try { await Notices.delete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Staff: read notices for their role
app.get('/api/notices', requireStaff, async (req, res) => {
  try {
    const role = req.user.role === 'admin' ? 'teacher' : req.user.role;
    res.json(await Notices.list(role));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STUDENTS ──────────────────────────────────────────────────
app.get('/api/students', requireAuth, async (req, res) => {
  try { res.json(await Students.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/students/by-class/:classId', requireAdmin, async (req, res) => {
  try {
    const classId = decodeURIComponent(req.params.classId);
    const all = await Students.list();
    res.json(all.filter(s => s.classId === classId).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/students', requireAdmin, async (req, res) => {
  try { await Students.save(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/students/:id', requireAdmin, async (req, res) => {
  try {
    await Students.delete(req.params.id);
    await Results.delete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RESULTS ───────────────────────────────────────────────────
app.get('/api/results', requireAuth, async (req, res) => {
  try { res.json(await Results.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/results/:studentId/:session/:term', requireAuth, async (req, res) => {
  try {
    const { studentId, session, term } = req.params;
    const result = await Results.get(studentId, decodeURIComponent(session), decodeURIComponent(term));
    res.json(result || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/results', requireAuth, async (req, res) => {
  try { await Results.save(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SETTINGS ──────────────────────────────────────────────────
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const s = await Settings.get();
    const { adminPassword, ...safe } = s;
    res.json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', requireAdmin, async (req, res) => {
  try { await Settings.save(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TEACHER MANAGEMENT ────────────────────────────────────────
app.get('/api/teachers', requireAdmin, async (req, res) => {
  try { res.json(await Users.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teachers', requireAdmin, async (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = await Users.create({ username, password, name });
    res.json(user);
  } catch (e) { res.status(400).json({ error: 'Username already exists' }); }
});

app.put('/api/teachers/:id', requireAdmin, async (req, res) => {
  try { await Users.update(req.params.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/teachers/:id', requireAdmin, async (req, res) => {
  try { await Users.delete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── BURSAR MANAGEMENT ─────────────────────────────────────────
app.get('/api/bursars', requireAdmin, async (req, res) => {
  try { res.json(await Users.listBursars()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bursars', requireAdmin, async (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const existing = await Users.findByUsername(username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    const user = await Users.createBursar({ username, password, name });
    res.json(user);
  } catch (e) { res.status(400).json({ error: e.message || 'Could not create bursar' }); }
});

app.put('/api/bursars/:id', requireAdmin, async (req, res) => {
  try { await Users.updateBursar(req.params.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bursars/:id', requireAdmin, async (req, res) => {
  try { await Users.deleteBursar(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SHARE TOKENS ──────────────────────────────────────────────
app.post('/api/share', requireAuth, async (req, res) => {
  try {
    const { studentId, session, term } = req.body;
    const token = await ShareTokens.create(studentId, session, term);
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/share/:token', async (req, res) => {
  try {
    const share = await ShareTokens.get(req.params.token);
    if (!share) return res.status(404).json({ error: 'Invalid or expired link' });
    const student  = await Students.get(share.studentId);
    const result   = await Results.get(share.studentId, share.session, share.term);
    const settings = await Settings.get();
    res.json({ student, result, settings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RECEIPTS ──────────────────────────────────────────────────
app.post('/api/receipts', requireBursar, async (req, res) => {
  try {
    const { studentId, session, term, date, items, payment_method, to_balance, bursar_name } = req.body;
    if (!studentId || !session || !term || !date || !items)
      return res.status(400).json({ error: 'Missing required fields' });
    const receipt = await Receipts.create({
      studentId, session, term, date, items,
      payment_method: payment_method || '',
      to_balance: to_balance || '',
      bursar_name: bursar_name || req.user.name || '',
      createdBy: req.user.id,
    });
    res.json(receipt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/receipts', requireBursar, async (req, res) => {
  try { res.json(await Receipts.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/receipts/:id', requireBursar, async (req, res) => {
  try {
    const r = await Receipts.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/receipts/:id/share', requireBursar, async (req, res) => {
  try {
    const r = await Receipts.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    const token = r.share_token || await Receipts.generateToken(req.params.id);
    const url   = `${req.protocol}://${req.get('host')}/receipt-view.html?token=${token}`;
    res.json({ token, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/receipts/:id', requireAdmin, async (req, res) => {
  try { await Receipts.delete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/receipt-public/:token', async (req, res) => {
  try {
    const r = await Receipts.getByToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'Receipt not found or link expired' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADMISSION ROUTES ──────────────────────────────────────────
// PUBLIC: Submit application
app.post('/api/admission/apply', async (req, res) => {
  try {
    const required = ['surname', 'firstName', 'phone'];
    for (const f of required) {
      if (!req.body[f]) return res.status(400).json({ error: `${f} is required` });
    }
    const result = await Applicants.apply(req.body);
    res.json({ success: true, refNumber: result.ref_number, id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: Check admission status
app.get('/api/admission/status/:ref', async (req, res) => {
  try {
    const applicant = await Applicants.getByRef(req.params.ref.toUpperCase());
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    res.json({
      refNumber:     applicant.ref_number,
      surname:       applicant.surname,
      firstName:     applicant.first_name,
      status:        applicant.status,
      classAdmitted: applicant.class_admitted,
      remark:        applicant.remark,
      appliedAt:     applicant.createdAt,
      admittedAt:    applicant.admittedAt,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: List all applicants
app.get('/api/admission/applicants', requireAdmin, async (req, res) => {
  try { res.json(await Applicants.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: Get single applicant
app.get('/api/admission/applicants/:id', requireAdmin, async (req, res) => {
  try {
    const applicant = await Applicants.get(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Not found' });
    res.json(applicant);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: Update status (admit / reject)
app.put('/api/admission/applicants/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, classAdmitted, remark } = req.body;
    if (!['pending', 'admitted', 'rejected'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });
    if (status === 'admitted' && !classAdmitted)
      return res.status(400).json({ error: 'classAdmitted is required when admitting' });
    const updated = await Applicants.updateStatus(req.params.id, { status, classAdmitted, remark });
    if (status === 'admitted') {
      try { await Applicants.promoteToStudent(req.params.id); } catch (_) {}
    }
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: Promote applicant to student manually
app.post('/api/admission/applicants/:id/promote', requireAdmin, async (req, res) => {
  try {
    const result = await Applicants.promoteToStudent(req.params.id);
    res.json({ success: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ADMIN: Delete applicant
app.delete('/api/admission/applicants/:id', requireAdmin, async (req, res) => {
  try { await Applicants.delete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DATA MIGRATION ────────────────────────────────────────────
app.post('/api/migrate', requireAdmin, async (req, res) => {
  const { students, results, settings } = req.body;
  try {
    if (students && students.length) await Students.bulkInsert(students);
    if (results  && results.length)  await Results.bulkInsert(results);
    if (settings) await Settings.save(settings);
    res.json({ ok: true, students: students?.length || 0, results: results?.length || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Boot ──────────────────────────────────────────────────────
initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Criterion College server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
