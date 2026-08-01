/* EMIC shared behavior: live market band, live feed, accordions, people grids */

const API = 'https://websiteemic.wixsite.com/emiccornell/_functions';

/* ---------- EM Watch market band ---------- */
async function loadMarketBand() {
  const track = document.getElementById('market-track');
  const band = document.getElementById('market-band');
  if (!track || !band) return;
  try {
    const res = await fetch(`${API}/emWatch`);
    const data = await res.json();
    const renderItem = (i) => {
      const up = i.changePercent >= 0;
      const arrow = up ? '▲' : '▼';
      const cls = up ? 'var(--up)' : 'var(--down)';
      const price = i.price != null ? i.price.toFixed(2) : '—';
      const pct = i.changePercent != null ? Math.abs(i.changePercent).toFixed(2) : '—';
      return `<div class="market-item">
        <span class="m-label">${i.label}</span>
        <span class="m-price">${price}</span>
        <span style="color:${cls};">${arrow} ${pct}%</span>
      </div>`;
    };
    const oneSet = data.items.map(renderItem).join('');
    track.style.animation = 'none';
    track.innerHTML = oneSet;
    const setWidth = track.scrollWidth;
    const copies = Math.max(2, Math.ceil((band.clientWidth * 2) / setWidth) + 1);
    track.innerHTML = oneSet.repeat(copies);
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
    const res = await fetch(`${API}/beatingSisyphus`);
    const data = await res.json();
    el.innerHTML = data.posts.slice(0, 3).map((p) => `
      <a href="${p.link}" target="_blank" rel="noopener">
        <div class="f-title">${p.title}</div>
        <div class="f-date">${p.date}</div>
        <div class="f-excerpt">${p.excerpt}</div>
      </a>
    `).join('');
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
    const res = await fetch(`${API}/beatingSisyphus`);
    const data = await res.json();
    const p = data.posts[0];
    el.innerHTML = `
      <a href="${p.link}" target="_blank" rel="noopener">
        ${p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : `<div class="f-thumb"></div>`}
        <div class="f-eyebrow">Featured — ${p.isPodcast ? 'Podcast' : 'Article'}</div>
        <div class="f-big">${p.title}</div>
        <div class="f-date" style="font-size:14px;color:var(--secondary);">${p.date}</div>
      </a>
    `;
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