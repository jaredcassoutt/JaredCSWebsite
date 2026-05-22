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
        <div class="kicker">// open source · ${escapeHTML(repo.owner === 'HaploLLC' ? 'Haplo, LLC' : repo.owner)}</div>
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
          <a class="btn ghost" href="https://github.com/${repo.owner}" target="_blank" rel="noopener">More from ${repo.owner === 'HaploLLC' ? 'Haplo, LLC' : repo.owner}</a>
        </div>
      </div>
      <div class="visual">${visual}</div>
    </div>`;
  }

  // Match by name substring — App Store names sometimes have suffixes like ": Screen Time For Focus"
  function matchApp(apps, needle) {
    const n = needle.toLowerCase();
    return apps.find(a => (a.name || '').toLowerCase().includes(n));
  }

  function renderAppVisual(slug) {
    if (slug === 'barrier') {
      // Real social-app SVG logos inside ice — TikTok, X, Reddit, all frozen
      return `
      <div class="viz-barrier">
        <div class="frozen-row">
          <div class="frozen-app tiktok">
            <div class="logo">
              <svg viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.27a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.05z"/>
              </svg>
            </div>
            <div class="frost"></div>
            <div class="shine"></div>
          </div>
          <div class="frozen-app x">
            <div class="logo">
              <svg viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <div class="frost"></div>
            <div class="shine"></div>
          </div>
          <div class="frozen-app reddit">
            <div class="logo">
              <svg viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-5.52-4.48-10-10-10zm5.83 11.62c.04.21.06.43.06.65 0 2.27-2.65 4.11-5.92 4.11s-5.92-1.84-5.92-4.11c0-.22.02-.44.06-.65a1.42 1.42 0 1 1 1.46-2.4c1.05-.7 2.45-1.14 4-1.21l.85-3.98c.02-.07.06-.13.12-.16.06-.04.13-.05.2-.04l2.81.56a1 1 0 1 1-.05 1.06l-2.52-.5-.75 3.52c1.51.08 2.88.52 3.91 1.21a1.42 1.42 0 1 1 1.7 2.04zM9 13.5c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1zm7-1c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-1.42 3.27c.16.16.16.42 0 .59-.64.63-1.85.69-2.21.69h-.01c-.36 0-1.57-.06-2.21-.69a.418.418 0 1 1 .59-.59c.41.4 1.27.55 1.62.55s1.22-.14 1.62-.55c.16-.17.43-.17.6 0z"/>
              </svg>
            </div>
            <div class="frost"></div>
            <div class="shine"></div>
          </div>
        </div>
        <div class="status">
          <span class="lock"></span>
          <span>FROZEN · UNBLOCKS IN 30s</span>
        </div>
      </div>`;
    }
    if (slug === 'haploai') {
      // Rotating 3D wireframe mesh — represents on-device 3D generation
      return `
      <div class="viz-haploai">
        <div class="mesh-stage">
          <div class="mesh-cube">
            <div class="face front"></div>
            <div class="face back"></div>
            <div class="face right"></div>
            <div class="face left"></div>
            <div class="face top"></div>
            <div class="face bottom"></div>
          </div>
        </div>
        <div class="mesh-label">
          <span class="dot"></span>
          <span>GENERATING · 4.2K POLYS</span>
        </div>
      </div>`;
    }
    if (slug === 'stockai') {
      return `
      <div class="viz-stock">
        <svg viewBox="0 0 220 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#88a8ff" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="#88a8ff" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <line class="grid-line" x1="0" y1="25" x2="220" y2="25" />
          <line class="grid-line" x1="0" y1="50" x2="220" y2="50" />
          <line class="grid-line" x1="0" y1="75" x2="220" y2="75" />
          <!-- actual history line -->
          <polyline class="actual" points="10,75 30,62 50,68 70,55 90,60 110,48 130,40 145,45" />
          <!-- predicted future -->
          <polyline class="predicted" points="145,45 165,35 185,28 205,18" />
          <!-- area fill under actual -->
          <path class="area" d="M 10,75 L 30,62 L 50,68 L 70,55 L 90,60 L 110,48 L 130,40 L 145,45 L 145,100 L 10,100 Z" />
          <!-- end-of-prediction dot -->
          <circle class="dot" cx="205" cy="18" r="4" />
          <text class="label" x="205" y="10" text-anchor="end">+27%</text>
        </svg>
      </div>`;
    }
    return '';
  }

  function renderFeaturedApp(app, slug) {
    if (!app) return '';
    return `
    <a class="featured-app" href="${app.url}" target="_blank" rel="noopener">
      <div class="fa-visual">${renderAppVisual(slug)}</div>
      <div class="fa-body">
        <div class="fa-head">
          <div class="fa-icon"><img src="${app.icon}" alt="${escapeHTML(app.name)}" loading="lazy" /></div>
          <div>
            <div class="fa-kicker">${escapeHTML(app.genre || '')} · ${escapeHTML(app.platform || 'iOS')}</div>
          </div>
        </div>
        <h3>${escapeHTML(app.name)}</h3>
        <div class="fa-desc">${escapeHTML(featuredCopy[slug] || '')}</div>
        <div class="fa-foot">
          ${app.rating > 0
            ? `<span><span class="stars">★ ${app.rating.toFixed(1)}</span> · ${app.ratingCount || 0}</span>`
            : `<span>App Store</span>`}
          <span>${escapeHTML(app.price)}</span>
        </div>
      </div>
    </a>`;
  }

  // Custom descriptions for the featured apps (App Store ones are too long/marketing-y)
  const featuredCopy = {
    barrier:  "Blocks Twitter, Reddit, TikTok, and friends. Adds a 30-second wall before every open so doom-scrolling becomes a real decision, not a reflex.",
    haploai:  "Run local LLMs, generate images with Stable Diffusion, and build 3D models — all on-device, fully offline. No API keys, no cloud.",
    stockai:  "Predicts directional trends for 2,500+ tickers using a trained model. Live signals, daily updates, no subscription."
  };

  function renderAppGrid(apps) {
    if (!apps.length) return renderEmpty('App Store data unavailable.');

    const barrier = matchApp(apps, 'barrier');
    const haploAI = matchApp(apps, 'haplo ai');
    const stockAI = matchApp(apps, 'stock market');
    const featuredIDs = new Set([barrier, haploAI, stockAI].filter(Boolean).map(a => a.name));

    // Rest = non-featured apps, sorted iOS-first then by ratings
    const rest = apps.filter(a => !featuredIDs.has(a.name)).sort((a, b) => {
      if (a.platform !== b.platform) return a.platform === 'iOS' ? -1 : 1;
      return (b.ratingCount || 0) - (a.ratingCount || 0);
    });

    const featuredHTML = `
    <div class="featured-apps stagger">
      ${renderFeaturedApp(barrier, 'barrier')}
      ${renderFeaturedApp(haploAI, 'haploai')}
      ${renderFeaturedApp(stockAI, 'stockai')}
    </div>`;

    const restHTML = rest.length ? `
    <div class="app-grid stagger" style="margin-top: 32px;">
      ${rest.map(a => `
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
    </div>` : '';

    return featuredHTML + restHTML;
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
    document.getElementById('haplo-mount').innerHTML     = renderBento(topHaplo, 'Haplo, LLC');
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
