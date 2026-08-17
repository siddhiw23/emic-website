/* EM Watch dashboard: current public snapshots rendered as accessible comparisons. */

const watchNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function watchDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function watchCompactDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', ' ’');
}

function watchEmpty(message) {
  const empty = document.createElement('p');
  empty.className = 'watch-empty';
  empty.textContent = message;
  return empty;
}

function watchBar({ label, value, maximum, display, detail, tone = '' }) {
  const row = document.createElement('div');
  row.className = 'watch-bar-row';

  const heading = document.createElement('div');
  heading.className = 'watch-bar-heading';
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('strong');
  amount.textContent = display;
  heading.append(name, amount);

  const track = document.createElement('div');
  track.className = 'watch-bar-track';
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', `${label}: ${display}${detail ? `, ${detail}` : ''}`);
  const bar = document.createElement('span');
  bar.className = `watch-bar-fill${tone ? ` ${tone}` : ''}`;
  bar.style.width = `${Math.max(3, Math.min(100, (Math.max(0, value) / maximum) * 100))}%`;
  track.append(bar);

  row.append(heading, track);
  if (detail) {
    const note = document.createElement('small');
    note.textContent = detail;
    row.append(note);
  }
  return row;
}

function renderDevelopment(data) {
  const root = document.getElementById('development-charts');
  const groups = new Map();
  data.items.forEach((item) => {
    if (!groups.has(item.label)) groups.set(item.label, []);
    groups.get(item.label).push(item);
  });
  const cards = [...groups.entries()].map(([label, items]) => {
    const card = document.createElement('article');
    card.className = 'watch-chart';
    const title = document.createElement('h2');
    title.textContent = label;
    const subtitle = document.createElement('p');
    subtitle.textContent = `${items[0]?.period || ''} · ${items[0]?.unit || ''}`;
    card.append(title, subtitle);
    const maximum = Math.max(...items.map((item) => Number(item.value)), 1) * 1.12;
    items.forEach((item) => card.append(watchBar({
      label: item.area,
      value: Number(item.value),
      maximum,
      display: `${watchNumber.format(Number(item.value))}${item.unit === '%' ? '%' : ''}`,
      detail: item.unit === '% GDP' ? '% of GDP' : ''
    })));
    return card;
  });
  root.replaceChildren(...cards);
}

function renderCredit(data) {
  const root = document.getElementById('credit-chart');
  if (!data.items.length) {
    root.replaceChildren(watchEmpty('No sovereign spread snapshot is currently available.'));
    return;
  }
  const header = document.createElement('div');
  header.className = 'watch-credit-head';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'EMBI spread history';
  const subtitle = document.createElement('p');
  subtitle.className = 'watch-chart-note';
  subtitle.textContent = 'Basis points over U.S. Treasuries · select a market';
  heading.append(title, subtitle);
  const control = document.createElement('label');
  control.className = 'watch-select-label';
  control.textContent = 'Market';
  const select = document.createElement('select');
  select.className = 'watch-select';
  data.items.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = item.label.replace(/^EMBI /, '');
    select.append(option);
  });
  const selectWrap = document.createElement('span');
  selectWrap.className = 'watch-select-wrap';
  selectWrap.append(select);
  control.append(selectWrap);
  header.append(heading, control);
  const summary = document.createElement('div');
  summary.className = 'watch-credit-summary';
  const chart = document.createElement('div');
  chart.className = 'watch-credit-history';
  const showCountry = () => {
    const item = data.items[Number(select.value)] || data.items[0];
    const change = Number(item.changeBps);
    const latest = document.createElement('strong');
    latest.textContent = `${watchNumber.format(Number(item.spreadBps))} bp`;
    const detail = document.createElement('span');
    detail.className = Number.isFinite(change) ? (change <= 0 ? 'watch-up' : 'watch-down') : '';
    detail.textContent = `${watchDate(item.date)}${Number.isFinite(change) ? ` · ${change <= 0 ? '▼' : '▲'} ${watchNumber.format(Math.abs(change))} bp daily` : ''}`;
    summary.replaceChildren(latest, detail);
    chart.replaceChildren(interactiveLineChart(item, { maxObservations: null, valueSuffix: ' bp', changeUnit: 'absolute', dragZoom: true }));
  };
  select.addEventListener('change', showCountry);
  root.replaceChildren(header, summary, chart);
  showCountry();
}

function renderMarket(data) {
  const root = document.getElementById('market-chart');
  if (!data.items.length) {
    root.replaceChildren(watchEmpty('The asset-price feed is not connected yet. This panel will populate automatically when the first market snapshot is available.'));
    return;
  }
  const title = document.createElement('h2');
  title.textContent = 'Market history';
  const subtitle = document.createElement('p');
  subtitle.className = 'watch-chart-note';
  subtitle.textContent = 'Daily closes · delayed Google Finance observations';
  const rows = document.createElement('div');
  rows.className = 'watch-market-grid';
  data.items.forEach((item) => {
    const quote = document.createElement('article');
    quote.className = 'watch-quote';
    const header = document.createElement('div');
    header.className = 'watch-quote-head';
    const identity = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = item.label || item.symbol;
    const symbol = document.createElement('small');
    symbol.textContent = `${item.symbol} · ${item.category || 'Market'}`;
    const price = document.createElement('strong');
    price.textContent = `${watchNumber.format(Number(item.price))}${item.category === 'Currency' ? '' : ' USD'}`;
    const change = document.createElement('small');
    const delta = Number(item.changePercent);
    change.className = Number.isFinite(delta) ? (delta >= 0 ? 'watch-up' : 'watch-down') : '';
    change.textContent = Number.isFinite(delta) ? `${delta >= 0 ? '▲' : '▼'} ${watchNumber.format(Math.abs(delta))}%` : 'Delayed';
    identity.append(label, symbol);
    const latest = document.createElement('div');
    latest.className = 'watch-quote-latest';
    latest.append(price, change);
    header.append(identity, latest);
    quote.append(header, interactiveLineChart(item));
    rows.append(quote);
  });
  root.replaceChildren(title, subtitle, rows);
}

function interactiveLineChart(item, { maxObservations = 90, valueSuffix = '', changeUnit = 'percent', dragZoom = false, originalSeries = null } = {}) {
  const available = (item.series || []).filter((point) => Number.isFinite(Number(point.value)));
  const observations = maxObservations ? available.slice(-maxObservations) : available;
  const fullSeries = originalSeries || observations;
  if (observations.length < 2) return watchEmpty('Not enough history to chart.');
  const width = 600;
  const height = 210;
  const padding = { top: 18, right: 16, bottom: 34, left: 50 };
  const values = observations.map((point) => Number(point.value));
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (minimum === maximum) { minimum -= 1; maximum += 1; }
  const x = (index) => padding.left + (index / (observations.length - 1)) * (width - padding.left - padding.right);
  const y = (value) => padding.top + ((maximum - value) / (maximum - minimum)) * (height - padding.top - padding.bottom);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'watch-line-chart');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${item.label}: ${observations.length} daily observations from ${watchDate(observations[0].date)} to ${watchDate(observations.at(-1).date)}`);
  [minimum, (minimum + maximum) / 2, maximum].forEach((value) => {
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', padding.left); line.setAttribute('x2', width - padding.right);
    line.setAttribute('y1', y(value)); line.setAttribute('y2', y(value));
    line.setAttribute('class', 'watch-gridline');
    const text = document.createElementNS(svg.namespaceURI, 'text');
    text.setAttribute('x', padding.left - 8); text.setAttribute('y', y(value) + 4);
    text.setAttribute('class', 'watch-axis-label'); text.setAttribute('text-anchor', 'end');
    text.textContent = watchNumber.format(value);
    svg.append(line, text);
  });
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('class', 'watch-line');
  path.setAttribute('d', observations.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(Number(point.value)).toFixed(1)}`).join(' '));
  svg.append(path);

  const selection = document.createElementNS(svg.namespaceURI, 'rect');
  selection.setAttribute('class', 'watch-zoom-selection');
  selection.setAttribute('y', padding.top);
  selection.setAttribute('height', height - padding.top - padding.bottom);
  selection.setAttribute('visibility', 'hidden');
  svg.append(selection);

  const guide = document.createElementNS(svg.namespaceURI, 'line');
  guide.setAttribute('class', 'watch-chart-guide');
  guide.setAttribute('visibility', 'hidden');
  guide.setAttribute('y1', padding.top);
  guide.setAttribute('y2', height - padding.bottom);
  const dot = document.createElementNS(svg.namespaceURI, 'circle');
  dot.setAttribute('class', 'watch-chart-dot');
  dot.setAttribute('r', '3');
  dot.setAttribute('visibility', 'hidden');
  svg.append(guide, dot);
  const tickCount = maxObservations ? 3 : 5;
  Array.from({ length: tickCount }, (_, tick) => {
    const index = Math.round((tick / (tickCount - 1)) * (observations.length - 1));
    return [x(index), observations[index].date, tick === 0 ? 'start' : tick === tickCount - 1 ? 'end' : 'middle'];
  }).forEach(([position, date, anchor]) => {
    const text = document.createElementNS(svg.namespaceURI, 'text');
    text.setAttribute('x', position); text.setAttribute('y', height - 8);
    text.setAttribute('class', 'watch-axis-label'); text.setAttribute('text-anchor', anchor);
    text.textContent = watchCompactDate(date);
    svg.append(text);
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'watch-chart-interactive';
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', `${item.label} interactive chart. Use left and right arrow keys to inspect daily values.`);
  const tooltip = document.createElement('div');
  tooltip.className = 'watch-chart-tooltip';
  tooltip.setAttribute('aria-live', 'polite');
  let activeIndex = observations.length - 1;
  let dragStartIndex = null;
  let dragging = false;

  const showObservation = (index) => {
    activeIndex = Math.max(0, Math.min(observations.length - 1, index));
    const point = observations[activeIndex];
    const prior = observations[activeIndex - 1];
    const change = prior?.value ? ((Number(point.value) - Number(prior.value)) / Number(prior.value)) * 100 : null;
    const chartX = x(activeIndex);
    guide.setAttribute('x1', chartX);
    guide.setAttribute('x2', chartX);
    guide.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', chartX);
    dot.setAttribute('cy', y(Number(point.value)));
    dot.setAttribute('visibility', 'visible');
    tooltip.replaceChildren();
    const date = document.createElement('span');
    date.textContent = watchDate(point.date);
    const value = document.createElement('strong');
    value.textContent = `${watchNumber.format(Number(point.value))}${valueSuffix}`;
    const movement = document.createElement('small');
    movement.className = Number.isFinite(change) ? (change >= 0 ? 'watch-up' : 'watch-down') : '';
    const movementValue = changeUnit === 'absolute'
      ? Number(point.value) - Number(prior?.value)
      : change;
    movement.className = Number.isFinite(movementValue) ? (movementValue >= 0 ? 'watch-up' : 'watch-down') : '';
    movement.textContent = Number.isFinite(movementValue)
      ? `${movementValue >= 0 ? '▲' : '▼'} ${watchNumber.format(Math.abs(movementValue))}${changeUnit === 'absolute' ? valueSuffix : '%'} from prior observation`
      : 'First observation';
    tooltip.append(date, value, movement);
    tooltip.style.left = `${(chartX / width) * 100}%`;
    wrapper.classList.add('is-inspecting');
  };

  const indexFromPointer = (event) => {
    const bounds = svg.getBoundingClientRect();
    const relative = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const chartRelative = Math.max(0, Math.min(1, (relative * width - padding.left) / (width - padding.left - padding.right)));
    return Math.round(chartRelative * (observations.length - 1));
  };
  wrapper.addEventListener('pointermove', (event) => {
    if (!dragging && !svg.contains(event.target)) return;
    const index = indexFromPointer(event);
    showObservation(index);
    if (dragging && dragStartIndex !== null) {
      const left = Math.min(x(dragStartIndex), x(index));
      selection.setAttribute('x', left);
      selection.setAttribute('width', Math.max(1, Math.abs(x(index) - x(dragStartIndex))));
      selection.setAttribute('visibility', 'visible');
    }
  });
  if (dragZoom) {
    wrapper.classList.add('is-zoomable');
    wrapper.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !svg.contains(event.target)) return;
      dragStartIndex = indexFromPointer(event);
      dragging = true;
      wrapper.setPointerCapture?.(event.pointerId);
      selection.setAttribute('x', x(dragStartIndex));
      selection.setAttribute('width', '1');
      selection.setAttribute('visibility', 'visible');
    });
    const finishZoom = (event) => {
      if (!dragging || dragStartIndex === null) return;
      const dragEndIndex = indexFromPointer(event);
      dragging = false;
      selection.setAttribute('visibility', 'hidden');
      const start = Math.min(dragStartIndex, dragEndIndex);
      const end = Math.max(dragStartIndex, dragEndIndex);
      dragStartIndex = null;
      if (end - start < 2) return;
      const zoomedSeries = observations.slice(start, end + 1);
      wrapper.replaceWith(interactiveLineChart(
        { ...item, series: zoomedSeries },
        { maxObservations: null, valueSuffix, changeUnit, dragZoom: true, originalSeries: fullSeries }
      ));
    };
    wrapper.addEventListener('pointerup', finishZoom);
    wrapper.addEventListener('pointercancel', () => {
      dragging = false;
      dragStartIndex = null;
      selection.setAttribute('visibility', 'hidden');
    });
  }
  wrapper.addEventListener('pointerleave', () => {
    if (document.activeElement !== wrapper) {
      wrapper.classList.remove('is-inspecting');
      guide.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
    }
  });
  wrapper.addEventListener('focus', () => showObservation(activeIndex));
  wrapper.addEventListener('blur', () => {
    wrapper.classList.remove('is-inspecting');
    guide.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
  });
  wrapper.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') showObservation(0);
    else if (event.key === 'End') showObservation(observations.length - 1);
    else showObservation(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });
  wrapper.append(svg, tooltip);
  if (dragZoom) {
    const zoomControls = document.createElement('div');
    zoomControls.className = 'watch-zoom-controls';
    const instruction = document.createElement('span');
    instruction.textContent = 'Drag across the chart to zoom';
    zoomControls.append(instruction);
    if (observations.length < fullSeries.length) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Reset zoom';
      reset.addEventListener('click', () => wrapper.replaceWith(interactiveLineChart(
        { ...item, series: fullSeries },
        { maxObservations: null, valueSuffix, changeUnit, dragZoom: true, originalSeries: fullSeries }
      )));
      zoomControls.append(reset);
    }
    wrapper.append(zoomControls);
  }
  return wrapper;
}

async function loadWatch() {
  const meta = document.getElementById('watch-meta');
  try {
    const [development, credit, market] = await Promise.all([
      loadJson('development.json'),
      loadJson('credit.json'),
      loadJson('market.json')
    ]);
    renderDevelopment(development);
    renderCredit(credit);
    renderMarket(market);
    const dates = [development.updatedAt, credit.updatedAt, market.updatedAt].filter(Boolean).map((value) => new Date(value));
    const latest = dates.sort((a, b) => b - a)[0];
    meta.textContent = latest ? `Latest site refresh: ${watchDate(latest.toISOString())}` : 'Latest stored observations';
  } catch (error) {
    meta.textContent = 'Data snapshots are temporarily unavailable.';
    document.getElementById('development-charts').replaceChildren(watchEmpty('Development data unavailable.'));
    document.getElementById('credit-chart').replaceChildren(watchEmpty('Credit-spread data unavailable.'));
    document.getElementById('market-chart').replaceChildren(watchEmpty('Market data unavailable.'));
  }
}

loadWatch();
