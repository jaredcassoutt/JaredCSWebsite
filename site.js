// Shared animations: hero word-stagger, reveal-on-scroll, parallax, card mouse glow.

(function () {
  'use strict';

  function splitWords(el) {
    const nodes = Array.from(el.childNodes);
    el.innerHTML = '';
    nodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = node.textContent.split(/(\s+)/);
        parts.forEach(p => {
          if (/^\s+$/.test(p)) el.appendChild(document.createTextNode(p));
          else if (p.length) {
            const s = document.createElement('span');
            s.className = 'word'; s.textContent = p;
            el.appendChild(s);
          }
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const parts = node.textContent.split(/(\s+)/);
        node.innerHTML = '';
        parts.forEach(p => {
          if (/^\s+$/.test(p)) node.appendChild(document.createTextNode(p));
          else if (p.length) {
            const s = document.createElement('span');
            s.className = 'word'; s.textContent = p;
            node.appendChild(s);
          }
        });
        el.appendChild(node);
      }
    });
  }

  // Hero h1: word-by-word entry animation
  function setupHero() {
    document.querySelectorAll('.hero h1[data-words]').forEach(h => {
      splitWords(h);
      h.querySelectorAll('.word').forEach((w, i) => {
        w.style.animationDelay = (0.18 + i * 0.06) + 's';
      });
    });
  }

  // Section h2 + .reveal-words: split into words, animate when in view
  function setupRevealWords() {
    document.querySelectorAll('.reveal-words').forEach(el => {
      splitWords(el);
      el.querySelectorAll('.word').forEach((w, i) => {
        w.style.transitionDelay = (i * 70) + 'ms';
      });
    });
  }

  // IntersectionObserver-driven reveals (all types)
  function setupReveals() {
    const els = document.querySelectorAll('.reveal, .reveal-focus, .reveal-words, .stagger, .section-tag');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  }

  // Aurora parallax drift on scroll
  function setupParallax() {
    const aurora = document.querySelector('.aurora');
    if (!aurora) return;
    let raf = null;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY * 0.25;
        aurora.style.setProperty('--parallax', y + 'px');
        aurora.style.transform = 'translateY(' + y + 'px)';
        raf = null;
      });
    }, { passive: true });
  }

  // Cards: mouse-follow glow via custom props (--mx, --my)
  function setupCardGlow() {
    document.body.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.card, .repo, .app-card, .notable-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  }

  // Animated count-up for stats: data-count="42"
  function setupCounters() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseInt(el.dataset.count, 10);
        if (isNaN(target)) return;
        const duration = 1200;
        const start = performance.now();
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        function tick(t) {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = prefix + Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(el => io.observe(el));
  }

  function init() {
    setupHero();
    setupRevealWords();
    setupReveals();
    setupParallax();
    setupCardGlow();
    setupCounters();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
