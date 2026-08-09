/* EMIC shared behavior: local data snapshots, accordions, people grids */

const DATA_ROOT = 'data';

async function loadJson(path) {
  const response = await fetch(`${DATA_ROOT}/${path}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/* ---------- EM Watch market band ---------- */
async function loadMarketBand() {
  const track = document.getElementById('market-track');
  const band = document.getElementById('market-band');
  if (!track || !band) return;
  try {
    const [market, development] = await Promise.all([
      loadJson('market.json').catch(() => ({ items: [] })),
      loadJson('development.json').catch(() => ({ items: [] }))
    ]);
    const items = [];
    market.items.forEach((item) => {
      const change = Number(item.changePercent);
      const price = Number(item.price);
      items.push({
        label: item.label,
        value: Number.isFinite(price) ? price.toFixed(2) : '—',
        detail: Number.isFinite(change) ? `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%` : 'Delayed',
        tone: Number.isFinite(change) ? (change >= 0 ? 'var(--up)' : 'var(--down)') : 'inherit'
      });
    });
    development.items.forEach((item) => {
      const value = Number(item.value);
      items.push({
        label: item.label,
        value: Number.isFinite(value) ? `${value.toFixed(1)}${item.unit || ''}` : '—',
        detail: item.period ? `${item.area} · ${item.period}` : item.area,
        tone: '#B8B6AE'
      });
    });
    if (!items.length) throw new Error('No market or development data');

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'market-item';
      const label = document.createElement('span');
      label.className = 'm-label';
      label.textContent = item.label;
      const value = document.createElement('span');
      value.className = 'm-price';
      value.textContent = item.value;
      const detail = document.createElement('span');
      detail.style.color = item.tone;
      detail.textContent = item.detail;
      row.append(label, value, detail);
      fragment.append(row);
    });
    track.style.animation = 'none';
    track.replaceChildren(fragment);
    const setWidth = track.scrollWidth;
    const copies = Math.max(2, Math.ceil((band.clientWidth * 2) / setWidth) + 1);
    const original = Array.from(track.children).map((node) => node.cloneNode(true));
    for (let copy = 1; copy < copies; copy += 1) {
      original.forEach((node) => track.append(node.cloneNode(true)));
    }
    const fullWidth = track.scrollWidth / copies;
    const duration = fullWidth / 40; /* 40px per second */
    let styleTag = document.getElementById('market-keyframes');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'market-keyframes';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `@keyframes market-scroll { from { transform: translateX(0); } to { transform: translateX(-${fullWidth}px); } }`;
    track.style.animation = `market-scroll ${duration}s linear infinite`;
  } catch (e) {
    track.textContent = 'Market data unavailable';
  }
}
loadMarketBand();
setInterval(loadMarketBand, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const band = document.getElementById('market-band');
    if (band) { band.style.display = 'none'; void band.offsetHeight; band.style.display = 'block'; }
  }
});

/* ---------- Beating Sisyphus feed (homepage teasers) ---------- */
async function loadFeedTeasers() {
  const el = document.getElementById('bs-feed');
  if (!el) return;
  try {
    const data = await loadJson('posts.json');
    const cards = data.posts.slice(0, 3).map((post) => {
      const link = document.createElement('a');
      link.href = safeExternalUrl(post.link) || 'https://beatingsisyphus.substack.com/';
      link.target = '_blank';
      link.rel = 'noopener';
      [['f-title', post.title], ['f-date', post.date], ['f-excerpt', post.excerpt]].forEach(([className, text]) => {
        const field = document.createElement('div');
        field.className = className;
        field.textContent = text || '';
        link.append(field);
      });
      return link;
    });
    el.replaceChildren(...cards);
  } catch (e) {
    el.innerHTML = '<p style="color:var(--secondary);">Latest posts are at <a class="textlink" href="https://beatingsisyphus.substack.com" target="_blank" rel="noopener">beatingsisyphus.substack.com</a>.</p>';
  }
}
loadFeedTeasers();

/* ---------- Featured post (Beating Sisyphus page) ---------- */
async function loadFeatured() {
  const el = document.getElementById('bs-featured');
  if (!el) return;
  try {
    const data = await loadJson('posts.json');
    const p = data.posts[0];
    if (!p) throw new Error('No featured post');
    const link = document.createElement('a');
    link.href = safeExternalUrl(p.link) || 'https://beatingsisyphus.substack.com/';
    link.target = '_blank';
    link.rel = 'noopener';
    const thumbnail = safeExternalUrl(p.thumbnail);
    if (thumbnail) {
      const image = document.createElement('img');
      image.src = thumbnail;
      image.alt = '';
      link.append(image);
    } else {
      const blank = document.createElement('div');
      blank.className = 'f-thumb';
      link.append(blank);
    }
    [['f-eyebrow', `Featured — ${p.isPodcast ? 'Podcast' : 'Article'}`], ['f-big', p.title], ['f-date', p.date]].forEach(([className, text]) => {
      const field = document.createElement('div');
      field.className = className;
      field.textContent = text || '';
      link.append(field);
    });
    el.replaceChildren(link);
  } catch (e) {
    el.innerHTML = '<p style="color:var(--secondary);">Visit <a class="textlink" href="https://beatingsisyphus.substack.com" target="_blank" rel="noopener">our Substack</a> for the latest.</p>';
  }
}
loadFeatured();

/* ---------- Accordions ---------- */
document.querySelectorAll('.acc-btn').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('.acc-item').classList.toggle('open'));
});

/* ---------- People grids (expand-below detail) ---------- */
function buildDetail(p) {
  const subline = [p.major, p.year ? `Class of ${p.year}` : ''].filter(Boolean).join(' · ');
  const row = (label, val) => val ? `<div class="pd-row"><span class="pd-label">${label}</span>${val}</div>` : '';
  return `
    <div class="pd-name">${p.name}</div>
    ${subline ? `<div class="pd-sub">${subline}</div>` : ''}
    ${row('Email', p.email)}
    ${row('Research interest', p.research)}
    ${row('Other involvement', p.involvement)}
    ${row('Professional interest', p.professional)}
    ${row('Favorite EM', p.favoriteEM)}
    ${row('Fun fact', p.funFact)}
  `;
}

function renderPeople(gridId, list, opts = {}) {
  const grid = document.getElementById(gridId);
  if (!grid || !list) return;
  grid.innerHTML = list.map((p, i) => `
    <button class="person" data-i="${i}" type="button" aria-expanded="false">
      <span class="p-photo">${p.photo ? `<img src="${p.photo}" alt="" style="object-position:${p.objectPosition || 'center'};transform:scale(${p.scale || 1});">` : ''}</span>
      <span class="p-name" style="display:block;">${p.name}</span>
      ${opts.showRole && p.role ? `<span class="p-role" style="display:block;">${p.role}</span>` : ''}
      ${p.major ? `<span class="p-major" style="display:block;">${p.major}</span>` : ''}
    </button>
  `).join('');

  // Insert the full-width detail panel directly after the last card in the
  // clicked card's visual row, so it opens right beneath that row.
  const placeAfterRow = (card, panel) => {
    const cards = Array.from(grid.querySelectorAll('.person'));
    const top = card.offsetTop;               // measured against a grid with no panel in it
    let lastInRow = card;
    cards.forEach((c) => { if (Math.abs(c.offsetTop - top) < 2) lastInRow = c; });
    lastInRow.insertAdjacentElement('afterend', panel);
  };

  grid.querySelectorAll('.person').forEach((card) => {
    card.addEventListener('click', () => {
      const p = list[Number(card.dataset.i)];

      const openPanel = grid.querySelector('.person-detail');
      const wasThisOpen = openPanel && openPanel.dataset.for === card.dataset.i;

      // Clear any open panel and reset expanded states first, so the row math
      // below runs against a clean grid.
      if (openPanel) openPanel.remove();
      grid.querySelectorAll('.person[aria-expanded="true"]')
          .forEach((c) => c.setAttribute('aria-expanded', 'false'));

      // Clicking the already-open person just closes it.
      if (wasThisOpen) return;

      const hasContent = p.email || p.research || p.involvement || p.major;
      if (!hasContent) return;

      const panel = document.createElement('div');
      panel.className = 'person-detail';
      panel.dataset.for = card.dataset.i;
      panel.innerHTML = buildDetail(p);
      placeAfterRow(card, panel);
      card.setAttribute('aria-expanded', 'true');
    });
  });

  // Keep an open panel under the correct row if the column count changes.
  grid._reposition = () => {
    const panel = grid.querySelector('.person-detail');
    if (!panel) return;
    const forI = panel.dataset.for;
    panel.remove();
    const card = grid.querySelector(`.person[data-i="${forI}"]`);
    if (card) placeAfterRow(card, panel);
  };
}

/* Reflow open detail panels on resize (debounced). */
let _peopleResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_peopleResizeTimer);
  _peopleResizeTimer = setTimeout(() => {
    document.querySelectorAll('.people').forEach((g) => g._reposition && g._reposition());
  }, 150);
});

/* Pages call renderPeople with their own data (see members-data.js). */
window.EMIC = { renderPeople };
