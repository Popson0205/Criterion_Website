/* layout.js — injects shared nav + footer */
(function () {
  const NAV = `
<nav class="navbar">
  <div class="navbar-inner">
    <a href="/" class="navbar-brand">
      <div class="navbar-logo">CC</div>
      <div class="navbar-name">Criterion Amazing College<span>Training a global competitive students is our watchword</span></div>
    </a>
    <div class="navbar-links" id="navLinks">
      <a href="/">Home</a>
      <a href="/pages/about.html">About</a>
      <a href="/pages/academics.html">Academics</a>
      <a href="/pages/admissions.html">Admissions</a>
      <a href="/pages/news.html">News</a>
      <a href="/pages/gallery.html">Gallery</a>
      <a href="/pages/contact.html">Contact</a>
      <a href="/pages/login.html" class="navbar-portal">Portal Login</a>
    </div>
    <button class="hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>`;

  const FOOTER = `
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--gold-400);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--green-900)">CC</div>
          <span style="color:var(--white);font-weight:700;font-size:1.05rem">Criterion Amazing College</span>
        </div>
        <p>Nurturing excellence, integrity, and service in every student since 1998. A community where learners become leaders.</p>
      </div>
      <div>
        <h5>Quick Links</h5>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/pages/about.html">About Us</a></li>
          <li><a href="/pages/academics.html">Academics</a></li>
          <li><a href="/pages/admissions.html">Admissions</a></li>
        </ul>
      </div>
      <div>
        <h5>Portals</h5>
        <ul>
          <li><a href="/pages/login.html?role=student">Student Portal</a></li>
          <li><a href="/pages/login.html?role=teacher">Teacher Portal</a></li>
          <li><a href="/pages/login.html?role=admin">Admin Portal</a></li>
          <li><a href="/pages/apply.html">Apply Now</a></li>
        </ul>
      </div>
      <div>
        <h5>Contact</h5>
        <ul>
          <li><a href="tel:+2348030463652">+2348030463652</a></li>
          <li><a href="mailto:info@criterionamazingcollege.edu.ng">info@criterionamazingcollege.edu.ng</a></li>
          <li><a href="/pages/contact.html">Find Us</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} Criterion Amazing College. All rights reserved.</span>
      <span>Built with care for <a href="#">our students</a></span>
    </div>
  </div>
</footer>`;

  document.addEventListener('DOMContentLoaded', function () {
    const navEl = document.getElementById('cc-nav');
    const footEl = document.getElementById('cc-footer');
    if (navEl)  navEl.innerHTML  = NAV;
    if (footEl) footEl.innerHTML = FOOTER;
  });
})();
