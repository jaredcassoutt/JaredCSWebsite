// Projects page: pull live data from GitHub (jaredcassoutt + HaploLLC) and iTunes (Haplo apps),
// then render featured spotlight, App Store grid, two bento grids, and notable projects.
// Caches API responses in localStorage with 1-hour TTL so refreshes don't burn GitHub's 60/hr rate limit.

(function () {
  'use strict';

  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  // ---- notable projects (curated, not from any API) ----
  const notable = [
    {
      name: 'AR Graphing App',
      desc: 'iOS app that turns equations and datasets into AR bar-charts, pie-graphs, scatterplots, and 3D mesh models you can walk around. Winner of the 2023 Oregon Innovation Challenge.',
      tech: ['Swift', 'ARKit', 'SceneKit', 'Python'],
      url: null,
      badge: 'Award winner'
    },
    {
      name: 'Mobile ASL Translator',
      desc: 'Real-time American Sign Language alphabet translation on iOS, powered by an object-detection model built in CreateML.',
      tech: ['Swift', 'Core ML', 'CreateML', 'Vision'],
      url: 'https://www.youtube.com/watch?v=A3WSZFOyvfk',
      badge: 'Video demo'
    },
    {
      name: 'Gift Recommendation App',
      desc: 'iOS app that recommends gifts from a recipient\'s interests, backed by a Python service using a Turi Create recommender.',
      tech: ['Swift', 'Python', 'Turi Create'],
      url: null,
      badge: 'Personal project'
    },
    {
      name: 'Group Chat Media App',
      desc: 'iOS app with a Firebase backend for hosting password-protected group chats. Built early on to learn realtime sync the hard way.',
      tech: ['Swift', 'Firebase'],
      url: null,
      badge: 'Personal project'
    }
  ];

  const spotlightTarget = { org: 'HaploLLC', name: 'Gepetto' };

  // ---- cache helpers ----
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > CACHE_TTL_MS) return { stale: true, v };
      return { stale: false, v };
    } catch (_) {
      return null;
    }
  }
  function cacheSet(key, v) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch (_) {}
  }

  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function cachedFetch(key, fn) {
    const cached = cacheGet(key);
    // If fresh, return immediately.
    if (cached && !cached.stale) return cached.v;
    // Try to refresh from the network.
    try {
      const fresh = await fn();
      cacheSet(key, fresh);
      return fresh;
    } catch (e) {
      console.warn('Network failed for', key, '— using stale cache:', e.message);
      if (cached) return cached.v; // Use stale data rather than nothing.
      return null;
    }
  }

  async function fetchUserRepos(user) {
    const data = await cachedFetch(`repos:user:${user}`, async () => {
      const d = await fetchJSON(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`);
      if (!Array.isArray(d)) throw new Error('Not an array (rate-limited?)');
      return d
        .filter(r => !r.fork && !r.archived && !r.name.toLowerCase().includes('jaredcswebsite'))
        .map(r => ({
          owner: user, name: r.name, desc: r.description || '',
          lang: r.language || '—', stars: r.stargazers_count, forks: r.forks_count,
          url: r.html_url, updated: r.updated_at
        }));
    });
    return data || [];
  }

  async function fetchOrgRepos(org) {
    const data = await cachedFetch(`repos:org:${org}`, async () => {
      const d = await fetchJSON(`https://api.github.com/orgs/${org}/repos?per_page=100`);
      if (!Array.isArray(d)) throw new Error('Not an array (rate-limited?)');
      return d
        .filter(r => !r.fork && !r.archived && r.name !== '.github')
        .map(r => ({
          owner: org, name: r.name, desc: r.description || '',
          lang: r.language || '—', stars: r.stargazers_count, forks: r.forks_count,
          url: r.html_url, updated: r.updated_at
        }));
    });
    return data || [];
  }

  async function fetchHFModels(user) {
    const data = await cachedFetch(`hf:user:${user}`, async () => {
      const d = await fetchJSON(`https://huggingface.co/api/models?author=${user}&limit=60&full=false`);
      if (!Array.isArray(d)) throw new Error('Not an array');
      return d.map(m => ({
        id: m.id,                       // "jc-builds/<name>"
        name: m.id.split('/').pop(),
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        pipeline: m.pipeline_tag || '',
        tags: m.tags || [],
        url: `https://huggingface.co/${m.id}`
      }));
    });
    return data || [];
  }

  async function fetchHaploApps() {
    // iTunes search splits iOS vs macOS by entity. Fetch both and merge.
    const data = await cachedFetch('itunes:haplo:all', async () => {
      const [iosResp, macResp] = await Promise.all([
        fetchJSON('https://itunes.apple.com/search?term=Haplo%2C+LLC&entity=software&country=US&limit=50').catch(() => ({ results: [] })),
        fetchJSON('https://itunes.apple.com/search?term=Haplo%2C+LLC&entity=macSoftware&country=US&limit=50').catch(() => ({ results: [] }))
      ]);
      const all = [...(iosResp.results || []), ...(macResp.results || [])];
      const seen = new Set();
      const filtered = all
        .filter(a => {
          const seller = (a.sellerName || a.artistName || '').toLowerCase();
          const name   = (a.trackName || '').toLowerCase();
          if (!seller.includes('haplo')) return false;
          if (name.includes('sticker')) return false;
          if (seen.has(a.trackId)) return false;
          seen.add(a.trackId);
          return true;
        });
      return filtered.map(a => ({
        name: a.trackName,
        genre: a.primaryGenreName,
        platform: (a.kind === 'mac-software' || a.wrapperType === 'macSoftware') ? 'macOS' : 'iOS',
        icon: (a.artworkUrl512 || a.artworkUrl100 || '').replace('100x100', '512x512'),
        url: a.trackViewUrl,
        rating: a.averageUserRating,
        ratingCount: a.userRatingCount,
        price: a.formattedPrice || 'Free'
      }));
    });
    return data || [];
  }

  // ---- bento layout ----
  function assignBentoSizes(repos) {
    const ranked = [...repos].sort((a, b) => {
      const sa = a.stars + (a.desc.length > 80 ? 1 : 0);
      const sb = b.stars + (b.desc.length > 80 ? 1 : 0);
      return sb - sa;
    });
    return ranked.map((r, i) => {
      let cls = '';
      if (i === 0 && r.stars >= 5) cls = 'span-2-tall';
      else if ((i === 1 || i === 2) && r.stars >= 2) cls = 'span-2';
      return { ...r, sizeClass: cls };
    });
  }

  function escapeHTML(s) {
    return (s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function renderEmpty(message) {
    return `<div class="empty-state">
      <div class="empty-icon">·</div>
      <div class="empty-msg">${escapeHTML(message)}</div>
      <div class="empty-sub">GitHub's anonymous rate limit caps at 60 requests per hour per IP. Try again shortly.</div>
    </div>`;
  }

  // ---- render ----
  function renderGepettoVisual() {
    return `
    <div class="gepetto-scene">
      <div class="gep-browser">
        <div class="gep-bar">
          <span class="gep-dot r"></span><span class="gep-dot y"></span><span class="gep-dot g"></span>
          <div class="gep-url">amazon.com/cart</div>
        </div>
        <div class="gep-body">
          <div class="gep-action done"><span class="gep-prefix">→</span><span class="gep-text">navigate to amazon.com</span></div>
          <div class="gep-action done"><span class="gep-prefix">→</span><span class="gep-text">search "paper towels"</span></div>
          <div class="gep-action live"><span class="gep-prefix">→</span><span class="gep-text">click "add to cart"</span></div>
        </div>
      </div>
      <div class="gep-strings"></div>
      <div class="gep-phone">
        <div class="gep-notch"></div>
        <div class="gep-llm">ON-DEVICE LLM</div>
        <div class="gep-prompt">"buy me paper towels"</div>
        <div class="gep-status">running locally</div>
      </div>
    </div>`;
  }

  function renderSpotlight(repo) {
    if (!repo) return renderEmpty('Spotlight unavailable right now.');
    const isGepetto = repo.name.toLowerCase() === 'gepetto';
    let visual;
    if (isGepetto) {
      visual = renderGepettoVisual();
    } else {
      let lit = 0;
      for (const c of repo.name) lit += c.charCodeAt(0);
      const cells = Array.from({ length: 36 }, (_, i) => {
        const on = ((lit * 31 + i * 17) % 7) < 2;
        return `<span class="${on ? 'lit' : ''}">${on ? '◆' : '·'}</span>`;
      }).join('');
      visual = `<div class="glyph-grid">${cells}</div><div class="ascii">${escapeHTML(repo.name).toLowerCase().slice(0, 6)}</div>`;
    }

    // Custom Gepetto pitch instead of the GitHub blurb
    const desc = isGepetto
      ? "An iPhone-side LLM that drives a real browser for you. Speak the goal, the on-device model breaks it into clicks, taps, and form fills — no cloud, no API key."
      : escapeHTML(repo.desc);

    const tech = isGepetto
      ? ['Swift', 'iOS', 'macOS', 'On-device LLM', 'Browser automation']
      : [repo.lang, 'iOS', 'macOS', 'Open source'];

    return `
    <div class="spotlight reveal">
      <div class="body">
        <div class="kicker">// open source · ${escapeHTML(repo.owner)}</div>
        <h2>${escapeHTML(repo.name)}</h2>
        <p class="desc">${isGepetto ? desc : desc}</p>
        <div class="stats">
          <div><span class="k">Stars</span><span class="v">${repo.stars}</span></div>
          <div><span class="k">Language</span><span class="v">${escapeHTML(repo.lang)}</span></div>
          <div><span class="k">Status</span><span class="v" style="color: var(--acc);">Live</span></div>
        </div>
        <div class="tech">${tech.map(t => `<span>${escapeHTML(t)}</span>`).join('')}</div>
        <div class="actions">
          <a class="btn" href="${repo.url}" target="_blank" rel="noopener">View on GitHub <span class="arrow">→</span></a>
          <a class="btn ghost" href="https://github.com/${repo.owner}" target="_blank" rel="noopener">More from ${repo.owner}</a>
        </div>
      </div>
      <div class="visual">${visual}</div>
    </div>`;
  }

  function renderAppGrid(apps) {
    if (!apps.length) return renderEmpty('App Store data unavailable.');
    // Sort: iOS first, then by rating count desc
    const sorted = [...apps].sort((a, b) => {
      if (a.platform !== b.platform) return a.platform === 'iOS' ? -1 : 1;
      return (b.ratingCount || 0) - (a.ratingCount || 0);
    });
    return `
    <div class="app-grid stagger">
      ${sorted.map(a => `
        <a class="app-tile glass" href="${a.url}" target="_blank" rel="noopener">
          <div class="app-icon">
            <img src="${a.icon}" alt="${escapeHTML(a.name)}" loading="lazy" />
          </div>
          <div class="app-info">
            <div class="app-name">${escapeHTML(a.name)}</div>
            <div class="app-genre">${escapeHTML(a.genre || '')}${a.genre && a.platform ? ' · ' : ''}<span class="platform-mark">${escapeHTML(a.platform || '')}</span></div>
            ${a.rating > 0
              ? `<div class="app-rating">★ ${a.rating.toFixed(1)} <span class="dim">· ${a.ratingCount || 0}</span></div>`
              : `<div class="app-rating dim">${escapeHTML(a.price)}</div>`}
          </div>
        </a>
      `).join('')}
    </div>`;
  }

  // Custom visuals for featured tools — purposeful animations representing what each one does
  function renderToolVisual(slug) {
    if (slug === 'mirage') {
      // Diffusion denoising mosaic — 48 cells flicker from noise to a coherent gradient
      const cells = Array.from({ length: 48 }, (_, i) => {
        const hue = 220 + (i % 8) * 4;       // shifts toward periwinkle
        const sat = 50 + ((i * 17) % 30);
        const delay = ((i * 73) % 4000) / 1000;
        return `<span style="--cell-color: hsl(${hue}, ${sat}%, 65%, 0.55); animation-delay: ${delay}s;"></span>`;
      }).join('');
      return `<div class="viz-mirage">${cells}</div>`;
    }
    if (slug === 'forge') {
      // Token streaming console — tokens appear one at a time with their probability
      const toks = [
        { i: 0, t: 'The',   p: '0.92' },
        { i: 1, t: ' quick', p: '0.84' },
        { i: 2, t: ' brown', p: '0.97' },
        { i: 3, t: ' fox',   p: '0.88' },
        { i: 4, t: ' jumps', p: '0.71' },
        { i: 5, t: ' over',  p: '0.95' }
      ];
      return `<div class="viz-forge">${toks.map(x =>
        `<div class="ftok"><span class="fidx">tok ${String(x.i).padStart(2, '0')}</span><span class="ftext">${escapeHTML(x.t)}</span><span class="fprob">${x.p}</span></div>`
      ).join('')}</div>`;
    }
    if (slug === 'mesh') {
      // Two devices with packets pulsing between them over LAN
      return `
      <div class="viz-mesh">
        <div class="device phone"><span class="label">iPhone</span></div>
        <div class="link">
          <span class="packet p1"></span>
          <span class="packet p2"></span>
        </div>
        <div class="device mac"><span class="label">Mac · 70B</span></div>
      </div>`;
    }
    return '';
  }

  function renderTools(haploRepos) {
    const wantedNames = ['mirage', 'forge', 'mesh'];
    const tools = wantedNames
      .map(name => haploRepos.find(r => r.name.toLowerCase() === name))
      .filter(Boolean);
    if (!tools.length) return ''; // gracefully skip if API failed
    return `
    <div class="featured-tools stagger">
      ${tools.map(t => `
        <a class="tool-card" href="${t.url}" target="_blank" rel="noopener">
          <div class="tool-visual">${renderToolVisual(t.name.toLowerCase())}</div>
          <div class="tool-body">
            <div class="tool-kicker">${escapeHTML(t.name)}</div>
            <h3>${escapeHTML(t.name)}</h3>
            <div class="tool-desc">${escapeHTML(t.desc) || ''}</div>
            <div class="tool-foot">
              <span class="stars">${t.stars}</span>
              <span>${escapeHTML(t.lang)}</span>
            </div>
          </div>
        </a>
      `).join('')}
    </div>`;
  }

  function renderBento(repos, orgLabel) {
    if (!repos.length) return renderEmpty('Repos unavailable right now.');
    const sized = assignBentoSizes(repos).slice(0, 8);
    return `
    <div class="bento stagger">
      ${sized.map(r => `
        <a class="repo ${r.sizeClass}" href="${r.url}" target="_blank" rel="noopener">
          <div class="head">
            <div class="name">${escapeHTML(r.name)}</div>
            <div class="lang" data-lang="${escapeHTML(r.lang)}">${escapeHTML(r.lang)}</div>
          </div>
          <div class="desc">${escapeHTML(r.desc) || '<em style="opacity:0.5">No description provided.</em>'}</div>
          <div class="foot">
            <span class="stars">${r.stars}</span>
            <span class="org">${escapeHTML(orgLabel)}</span>
          </div>
        </a>
      `).join('')}
    </div>`;
  }

  // Friendly labels for HF pipeline tags
  const PIPELINE_LABEL = {
    'text-generation': 'LLM',
    'image-text-to-text': 'Vision LM',
    'text-to-image': 'Diffusion',
    'image-to-image': 'Diffusion',
    'image-to-3d': '3D',
    'image-to-text': 'CLIP',
    'tabular-classification': 'Tabular',
    'tabular-regression': 'Tabular',
    '': 'Quantized'
  };

  function modelKind(m) {
    if (PIPELINE_LABEL[m.pipeline]) return PIPELINE_LABEL[m.pipeline];
    return m.pipeline || 'Model';
  }

  function fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return String(n);
  }

  function renderModels(models) {
    if (!models.length) return renderEmpty('HuggingFace models unavailable.');

    // Top by downloads, but include a couple of high-likes "interesting" models
    const byDownloads = [...models].sort((a, b) => b.downloads - a.downloads);
    const top = byDownloads.slice(0, 10);
    const totalDownloads = models.reduce((s, m) => s + m.downloads, 0);

    return `
    <div class="hf-summary reveal">
      <div class="hf-stats">
        <div><span class="k">Models published</span><span class="v">${models.length}</span></div>
        <div><span class="k">Monthly downloads</span><span class="v">${fmt(totalDownloads)}</span><span class="k-note">last 30 days</span></div>
        <div><span class="k">Specialty</span><span class="v">on-device</span></div>
        <div><span class="k">Format</span><span class="v">GGUF · Core ML</span></div>
      </div>
    </div>
    <div class="hf-grid stagger">
      ${top.map(m => `
        <a class="hf-card" href="${m.url}" target="_blank" rel="noopener">
          <div class="hf-head">
            <div class="hf-name">${escapeHTML(m.name)}</div>
            <div class="hf-kind">${escapeHTML(modelKind(m))}</div>
          </div>
          <div class="hf-tags">
            ${m.tags.slice(0, 4).filter(t => !t.includes(':')).map(t => `<span>${escapeHTML(t)}</span>`).join('')}
          </div>
          <div class="hf-foot">
            <span class="hf-downloads" title="downloads in the last 30 days">↓ ${fmt(m.downloads)}/mo</span>
            ${m.likes > 0 ? `<span class="hf-likes">♡ ${m.likes}</span>` : ''}
            <span class="hf-org">jc-builds</span>
          </div>
        </a>
      `).join('')}
    </div>
    <div class="hf-footnote reveal">
      <a href="https://huggingface.co/jc-builds" target="_blank" rel="noopener">
        See all ${models.length} on HuggingFace <span class="arrow">→</span>
      </a>
    </div>`;
  }

  function renderNotable() {
    return `
    <div class="notable-grid stagger">
      ${notable.map(p => `
        <div class="notable-card">
          <div class="badge">// ${escapeHTML(p.badge)}</div>
          <h3>${escapeHTML(p.name)}</h3>
          <div class="desc">${escapeHTML(p.desc)}</div>
          <div class="tech">${p.tech.map(t => `<span>${escapeHTML(t)}</span>`).join('')}</div>
          ${p.url ? `<div style="margin-top: 18px;"><a class="btn sm ghost" href="${p.url}" target="_blank" rel="noopener">Watch demo <span class="arrow">→</span></a></div>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  function setupFilters() {
    const sections = {
      spotlight: document.getElementById('section-spotlight'),
      apps:      document.getElementById('section-apps'),
      haplo:     document.getElementById('section-haplo'),
      personal:  document.getElementById('section-personal'),
      models:    document.getElementById('section-models'),
      notable:   document.getElementById('section-notable')
    };
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        Object.entries(sections).forEach(([key, el]) => {
          if (!el) return;
          el.style.display = (f === 'all' || f === key) ? '' : 'none';
        });
      });
    });
  }

  function rebindReveals(root) {
    const els = (root || document).querySelectorAll('.reveal, .reveal-focus, .reveal-words, .stagger, .section-tag');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('in')); return;
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

  async function init() {
    const [haploRepos, personalRepos, apps, models] = await Promise.all([
      fetchOrgRepos('HaploLLC'),
      fetchUserRepos('jaredcassoutt'),
      fetchHaploApps(),
      fetchHFModels('jc-builds')
    ]);

    let spotlight = haploRepos.find(r => r.name.toLowerCase() === spotlightTarget.name.toLowerCase());
    if (!spotlight && haploRepos.length) spotlight = [...haploRepos].sort((a, b) => b.stars - a.stars)[0];
    const restHaplo = haploRepos.filter(r => !spotlight || r.name !== spotlight.name);

    const topHaplo    = [...restHaplo].sort((a, b) => b.stars - a.stars).slice(0, 8);
    const topPersonal = [...personalRepos].sort((a, b) => b.stars - a.stars).slice(0, 8);

    document.getElementById('spotlight-mount').innerHTML = renderSpotlight(spotlight);
    const toolsMount = document.getElementById('tools-mount');
    if (toolsMount) toolsMount.innerHTML = renderTools(haploRepos);
    document.getElementById('apps-mount').innerHTML      = renderAppGrid(apps);
    document.getElementById('haplo-mount').innerHTML     = renderBento(topHaplo, 'HaploLLC');
    document.getElementById('personal-mount').innerHTML  = renderBento(topPersonal, 'jaredcassoutt');
    const modelsMount = document.getElementById('models-mount');
    if (modelsMount) modelsMount.innerHTML = renderModels(models);
    document.getElementById('notable-mount').innerHTML   = renderNotable();

    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n || '·'; };
    setCount('count-apps',     apps.length || '·');
    setCount('count-haplo',    topHaplo.length + (spotlight ? 1 : 0));
    setCount('count-personal', topPersonal.length);
    setCount('count-models',   models.length);
    setCount('count-notable',  notable.length);

    setupFilters();
    rebindReveals(document);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
