/* ============================================================
   main.js — Shared utilities for Criterion College website
   ============================================================ */

// ── Config ────────────────────────────────────────────────────
const API = window.CC_API_BASE || '';   // same-origin by default

// ── API Helper ────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Auth helpers ──────────────────────────────────────────────
function saveAuth(data) {
  localStorage.setItem('cc_token', data.token);
  localStorage.setItem('cc_role',  data.role);
  localStorage.setItem('cc_name',  data.name || '');
  if (data.studentId) localStorage.setItem('cc_student_id', data.studentId);
  if (data.classId)   localStorage.setItem('cc_class_id',  data.classId);
}
function getToken()   { return localStorage.getItem('cc_token'); }
function getRole()    { return localStorage.getItem('cc_role'); }
function getName()    { return localStorage.getItem('cc_name'); }
function isLoggedIn() { return !!getToken(); }
function logout() {
  ['cc_token','cc_role','cc_name','cc_student_id','cc_class_id'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/pages/login.html';
}

// ── Redirect helpers ──────────────────────────────────────────
function requireStudentAuth() {
  if (!isLoggedIn() || getRole() !== 'student') {
    window.location.href = '/pages/login.html?role=student';
  }
}
function requireStaffAuth() {
  const role = getRole();
  if (!isLoggedIn() || !['admin','teacher','bursar'].includes(role)) {
    window.location.href = '/pages/login.html';
  }
}
function requireAdminAuth() {
  if (!isLoggedIn() || getRole() !== 'admin') {
    window.location.href = '/pages/login.html?role=admin';
  }
}

// ── Navbar active link ────────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.navbar-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path ||
      (path !== '/' && path !== '/index.html' && a.getAttribute('href') && a.getAttribute('href') !== '/' && path.includes(a.getAttribute('href'))));
  });
}

// ── Hamburger menu ────────────────────────────────────────────
function initHamburger() {
  const btn   = document.querySelector('.hamburger');
  const links = document.querySelector('.navbar-links');
  if (!btn || !links) return;
  btn.addEventListener('click', () => links.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !links.contains(e.target)) links.classList.remove('open');
  });
}

// ── FAQ accordion ─────────────────────────────────────────────
function initFAQ() {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const ans = btn.nextElementSibling;
      const isOpen = btn.classList.contains('open');
      document.querySelectorAll('.faq-q.open').forEach(b => {
        b.classList.remove('open');
        b.nextElementSibling.classList.remove('open');
      });
      if (!isOpen) { btn.classList.add('open'); ans.classList.add('open'); }
    });
  });
}

// ── Alert helper ──────────────────────────────────────────────
function showAlert(el, msg, type = 'error') {
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
  if (type === 'success') setTimeout(() => el.classList.remove('show'), 5000);
}

// ── Format date ───────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init on DOM ready ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  initHamburger();
  initFAQ();
});
