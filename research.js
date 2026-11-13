/* Local, dependency-free research collection. All content is rendered as text. */
(() => {
  const get = id => document.getElementById(id);
  const search = get('research-search');
  const format = get('research-format');
  const year = get('research-year');
  const sort = get('research-sort');
  const results = get('research-results');
  let topic = '';
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  [...new Set(RESEARCH.map(p => p.format))].sort().forEach(value => format.add(new Option(value, value)));
  [...new Set(RESEARCH.map(p => p.year).filter(Boolean))].sort((a, b) => b - a).forEach(value => year.add(new Option(value, value)));
  ['', ...new Set(RESEARCH.map(p => p.topic))].forEach(value => {
    const button = element('button', '', value || 'All research');
    button.type = 'button';
    button.dataset.topic = value;
    button.setAttribute('aria-pressed', String(value === topic));
    button.addEventListener('click', () => { topic = value; render(); });
    get('research-topics').append(button);
  });
  function card(paper) {
    const article = element('article', 'research-card');
    const heading = element('h3', '', paper.title);
    heading.id = `research-${paper.id}`;
    article.setAttribute('aria-labelledby', heading.id);
    const meta = element('div', 'research-card-top');
    const dateLabel = paper.date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${paper.date}T00:00:00Z`)) : (paper.year || '');
    meta.append(element('span', '', paper.format), element('span', '', String(dateLabel)));
    const tags = element('div', 'research-tags');
    [paper.topic, paper.region].forEach(tag => tags.append(element('span', '', tag)));
    const details = element('details');
    const summaryLabel = paper.abstractLabel || 'Read abstract';
    const summary = element('summary', '', summaryLabel);
    details.append(summary, element('p', '', paper.abstract));
    details.addEventListener('toggle', () => { summary.textContent = details.open ? summaryLabel.replace('Read', 'Close') : summaryLabel; });
    const links = element('div', 'research-paper-links');
    const addLink = (value, label) => {
      let url;
      try { url = value ? new URL(value, document.baseURI) : null; } catch { return false; }
      if (!url || !['https:', 'http:'].includes(url.protocol)) return false;
      const link = element('a', 'textlink', label);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener';
      links.append(link);
      return true;
    };
    if (!addLink(paper.url, paper.linkLabel || 'Read paper (PDF) ↗')) {
      details.append(element('p', 'research-availability', 'Full text is not yet available.'));
    }
    addLink(paper.projectUrl, 'Explore interactive tracker ↗');
    const authors = element('p', 'research-authors');
    paper.authors.forEach((name, index) => {
      if (index) authors.append(' · ');
      let profile;
      try { profile = paper.authorUrls?.[name] ? new URL(paper.authorUrls[name]) : null; } catch { profile = null; }
      if (profile && ['https:', 'http:'].includes(profile.protocol)) {
        const link = element('a', '', name);
        link.href = profile.href;
        link.target = '_blank';
        link.rel = 'noopener';
        authors.append(link);
      } else {
        authors.append(name);
      }
    });
    article.append(meta, heading, authors, element('p', 'research-description', paper.description), tags, details);
    if (links.childElementCount) article.append(links);
    return article;
  }
  function render() {
    const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    const filtered = RESEARCH.filter(p => {
      const haystack = normalize([p.title, ...p.authors, p.topic, p.region, p.description, p.abstract, p.format, p.year].join(' '));
      return (!topic || p.topic === topic) && (!format.value || p.format === format.value) && (!year.value || String(p.year) === year.value) && terms.every(term => haystack.includes(term));
    });
    filtered.sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title) : Number(!a.year) - Number(!b.year) || (sort.value === 'oldest' ? (a.year || 0) - (b.year || 0) : (b.year || 0) - (a.year || 0)) || a.title.localeCompare(b.title));
    results.replaceChildren(...filtered.map(card));
    get('research-count').textContent = `${filtered.length} of ${RESEARCH.length} publications`;
    get('research-topics').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === topic)));
    if (!filtered.length) {
      const empty = element('div', 'research-empty');
      empty.append(element('h3', '', 'No research found'), element('p', '', 'Try a different keyword or reset the filters to see the full collection.'));
      results.append(empty);
    }
  }
  get('research-filters').addEventListener('submit', event => event.preventDefault());
  search.addEventListener('input', render);
  [format, year, sort].forEach(control => control.addEventListener('change', render));
  get('research-clear').addEventListener('click', () => {
    get('research-filters').reset();
    topic = '';
    render();
    search.focus();
  });
  render();
})();
