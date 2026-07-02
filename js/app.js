// ============================================================
// OFFICE LEDGER — app logic
// Everything syncs live through the Firestore "events" collection
// so every officemate who opens the page sees the same calendar.
// ============================================================

const CATEGORIES = [
  { key: 'TO',       label: 'TO (Travel Order)',           color: '#3B6EA5' },
  { key: 'SO/MO',    label: 'SO/MO (Special Order/Memo)',  color: '#8B5FBF' },
  { key: 'ABSENT',   label: 'ABSENT',                       color: '#B5482F' },
  { key: 'LEAVE',    label: 'LEAVE',                        color: '#4C7A67' },
  { key: 'PASS SLIP',label: 'PASS SLIP',                    color: '#C99A2E' },
];

const WEEKDAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let state = {
  view: 'month',
  cursor: startOfDay(new Date()),
  events: [],
  editingId: null,
};

let modalDates = []; // array of 'YYYY-MM-DD' strings for the entry currently open in the modal

function categoryColor(key) {
  const c = CATEGORIES.find(c => c.key === key);
  return c ? c.color : '#5B5E72';
}
function categoryLabel(key) {
  const c = CATEGORIES.find(c => c.key === key);
  return c ? c.label : key;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function isSameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function toDateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d) { return addDays(startOfDay(d), -d.getDay()); }

const el = {
  tabs: document.querySelectorAll('.tab'),
  views: { month: document.getElementById('monthView'), week: document.getElementById('weekView'), day: document.getElementById('dayView') },
  monthWeekdayRow: document.getElementById('monthWeekdayRow'),
  monthGrid: document.getElementById('monthGrid'),
  weekGrid: document.getElementById('weekGrid'),
  dayGrid: document.getElementById('dayGrid'),
  currentLabel: document.getElementById('currentLabel'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  todayBtn: document.getElementById('todayBtn'),
  newEventBtn: document.getElementById('newEventBtn'),
  legendList: document.getElementById('legendList'),
  authorName: document.getElementById('authorName'),
  connectionBanner: document.getElementById('connectionBanner'),

  modalBackdrop: document.getElementById('modalBackdrop'),
  eventForm: document.getElementById('eventForm'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('modalClose'),
  cancelBtn: document.getElementById('cancelBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
  eventId: document.getElementById('eventId'),
  eventTitle: document.getElementById('eventTitle'),
  dateInput: document.getElementById('dateInput'),
  addDateBtn: document.getElementById('addDateBtn'),
  dateChips: document.getElementById('dateChips'),
  eventPeople: document.getElementById('eventPeople'),
  eventCategory: document.getElementById('eventCategory'),
  categoryColorDot: document.getElementById('categoryColorDot'),
  modalError: document.getElementById('modalError'),
};

function init() {
  restoreAuthorName();
  buildCategoryDropdown();
  bindNav();
  bindModal();
  subscribeToEvents();
  render();
}

function restoreAuthorName() {
  const saved = localStorage.getItem('officeLedgerAuthor');
  if (saved) el.authorName.value = saved;
  el.authorName.addEventListener('input', () => {
    localStorage.setItem('officeLedgerAuthor', el.authorName.value.trim());
  });
}

function buildCategoryDropdown() {
  CATEGORIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = c.label;
    el.eventCategory.appendChild(opt);
  });
  el.eventCategory.addEventListener('change', updateCategoryDot);
}

function updateCategoryDot() {
  const key = el.eventCategory.value;
  el.categoryColorDot.style.background = key ? categoryColor(key) : 'transparent';
}

function bindNav() {
  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.view;
      Object.values(el.views).forEach(v => v.hidden = true);
      el.views[state.view].hidden = false;
      render();
    });
  });

  el.prevBtn.addEventListener('click', () => step(-1));
  el.nextBtn.addEventListener('click', () => step(1));
  el.todayBtn.addEventListener('click', () => { state.cursor = startOfDay(new Date()); render(); });
  el.newEventBtn.addEventListener('click', () => openModal(null, state.cursor));
}

function step(dir) {
  if (state.view === 'month') state.cursor = addMonths(state.cursor, dir);
  else if (state.view === 'week') state.cursor = addDays(state.cursor, dir * 7);
  else state.cursor = addDays(state.cursor, dir);
  render();
}

function subscribeToEvents() {
  el.connectionBanner.hidden = false;
  db.collection('events').onSnapshot(
    snap => {
      el.connectionBanner.hidden = true;
      state.events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      render();
    },
    err => {
      el.connectionBanner.hidden = false;
      el.connectionBanner.textContent = 'Could not connect to the shared calendar — check js/firebase-config.js';
      console.error(err);
    }
  );
}

function render() {
  renderLabel();
  renderLegend();
  if (state.view === 'month') renderMonth();
  else if (state.view === 'week') renderWeek();
  else renderDay();
}

function renderLabel() {
  if (state.view === 'month') {
    el.currentLabel.textContent = `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;
  } else if (state.view === 'week') {
    const start = startOfWeek(state.cursor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    el.currentLabel.textContent = sameMonth
      ? `${MONTHS[start.getMonth()].slice(0,3)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
      : `${MONTHS[start.getMonth()].slice(0,3)} ${start.getDate()} – ${MONTHS[end.getMonth()].slice(0,3)} ${end.getDate()}`;
  } else {
    el.currentLabel.textContent = `${WEEKDAYS_SHORT[state.cursor.getDay()]}, ${MONTHS[state.cursor.getMonth()].slice(0,3)} ${state.cursor.getDate()}`;
  }
}

function renderLegend() {
  el.legendList.innerHTML = '';
  CATEGORIES.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="legend-swatch" style="background:${c.color}"></span>${escapeHtml(c.label)}`;
    el.legendList.appendChild(li);
  });
}

function renderMonth() {
  el.monthWeekdayRow.innerHTML = WEEKDAYS_SHORT.map(d => `<div>${d}</div>`).join('');

  const firstOfMonth = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  const today = startOfDay(new Date());
  const days = Array.from({length:42}, (_,i) => addDays(gridStart, i));

  const dayIndexMap = new Map();
  days.forEach((d,i) => dayIndexMap.set(toDateKey(d), i));

  // Turn each event's dates into contiguous-run "bar" segments, split at
  // week-row boundaries so each segment can be drawn as one continuous
  // strip within a single grid row.
  const segmentsByRow = Array.from({length:6}, () => []);
  state.events.forEach(ev => {
    const dates = eventDates(ev).slice().sort();
    if (dates.length === 0) return;
    groupConsecutiveDates(dates).forEach(run => {
      const indices = run.map(d => dayIndexMap.get(d)).filter(i => i !== undefined).sort((a,b)=>a-b);
      if (indices.length === 0) return;
      let segStart = indices[0];
      for (let i = 1; i <= indices.length; i++) {
        const isLast = i === indices.length;
        const prevIdx = indices[i-1];
        const curIdx = isLast ? null : indices[i];
        const continues = !isLast && curIdx === prevIdx + 1 && Math.floor(curIdx/7) === Math.floor(prevIdx/7);
        if (!continues) {
          const row = Math.floor(segStart/7);
          const colStart = segStart % 7;
          const colSpan = (prevIdx % 7) - colStart + 1;
          segmentsByRow[row].push({ colStart, colSpan, event: ev });
          segStart = curIdx;
        }
      }
    });
  });

  el.monthGrid.innerHTML = '';
  for (let row = 0; row < 6; row++) {
    const rowDays = days.slice(row*7, row*7+7);
    const rowSegments = segmentsByRow[row];
    const laneCount = Math.max(assignLanes(rowSegments), 1);

    const rowEl = document.createElement('div');
    rowEl.className = 'month-row';
    rowEl.style.gridTemplateRows = `22px repeat(${laneCount}, 20px) 6px`;

    rowDays.forEach((day, col) => {
      const inMonth = day.getMonth() === state.cursor.getMonth();
      const bg = document.createElement('div');
      bg.className = 'daycell-bg' + (inMonth ? '' : ' other-month');
      bg.style.gridColumn = `${col+1} / span 1`;
      bg.style.gridRow = `1 / -1`;
      bg.addEventListener('click', () => openModal(null, day));
      rowEl.appendChild(bg);
    });

    rowDays.forEach((day, col) => {
      const inMonth = day.getMonth() === state.cursor.getMonth();
      const num = document.createElement('div');
      num.className = 'day-num' + (inMonth ? '' : ' other-month');
      num.style.gridColumn = `${col+1} / span 1`;
      num.style.gridRow = '1';
      num.innerHTML = isSameDay(day, today) ? `<span class="today-badge">${day.getDate()}</span>` : day.getDate();
      rowEl.appendChild(num);
    });

    rowSegments.forEach(seg => {
      const bar = document.createElement('div');
      bar.className = 'month-bar';
      bar.style.gridColumn = `${seg.colStart+1} / span ${seg.colSpan}`;
      bar.style.gridRow = `${seg.lane + 2}`;
      bar.style.background = seg.event.color || categoryColor(seg.event.category);
      bar.textContent = seg.event.title;
      bar.title = pillTooltip(seg.event);
      bar.addEventListener('click', (e) => { e.stopPropagation(); openModal(seg.event); });
      rowEl.appendChild(bar);
    });

    el.monthGrid.appendChild(rowEl);
  }
}

function eventDates(ev) {
  return (ev.dates && ev.dates.length) ? ev.dates : (ev.date ? [ev.date] : []);
}

function groupConsecutiveDates(sortedDates) {
  const runs = [];
  let current = [sortedDates[0]];
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i-1] + 'T00:00:00');
    const cur = new Date(sortedDates[i] + 'T00:00:00');
    const diff = Math.round((cur - prev) / 86400000);
    if (diff === 1) {
      current.push(sortedDates[i]);
    } else {
      runs.push(current);
      current = [sortedDates[i]];
    }
  }
  runs.push(current);
  return runs;
}

// Packs segments into the minimum number of stacked "lanes" so overlapping
// date ranges don't visually collide, like multi-day events in most
// calendar UIs. Mutates each segment with a .lane index; returns lane count.
function assignLanes(segments) {
  segments.sort((a,b) => a.colStart - b.colStart || b.colSpan - a.colSpan);
  const lanes = [];
  segments.forEach(seg => {
    const colEnd = seg.colStart + seg.colSpan - 1;
    let lane = lanes.findIndex(items => !items.some(it => !(colEnd < it.colStart || seg.colStart > it.colEnd)));
    if (lane === -1) {
      lanes.push([]);
      lane = lanes.length - 1;
    }
    lanes[lane].push({ colStart: seg.colStart, colEnd });
    seg.lane = lane;
  });
  return lanes.length;
}

function formatPeople(people) {
  if (!people) return '';
  return people.split('\n').map(s => s.trim()).filter(Boolean).join(', ');
}

function pillTooltip(ev) {
  const parts = [categoryLabel(ev.category)];
  const people = formatPeople(ev.people);
  if (people) parts.push('People: ' + people);
  if (ev.author) parts.push('Added by ' + ev.author);
  return parts.join(' — ');
}

function eventsOnDate(day) {
  const key = toDateKey(day);
  return state.events.filter(e => (e.dates && e.dates.includes(key)) || e.date === key);
}

function renderWeek() {
  const start = startOfWeek(state.cursor);
  const days = Array.from({length:7}, (_,i) => addDays(start, i));
  const today = startOfDay(new Date());

  const dayIndexMap = new Map();
  days.forEach((d,i) => dayIndexMap.set(toDateKey(d), i));

  // Same bar-segment approach as month view, but everything lives in one
  // row since a week view has no row-wrapping.
  const segments = [];
  state.events.forEach(ev => {
    const dates = eventDates(ev).slice().sort();
    if (dates.length === 0) return;
    groupConsecutiveDates(dates).forEach(run => {
      const indices = run.map(d => dayIndexMap.get(d)).filter(i => i !== undefined).sort((a,b)=>a-b);
      if (indices.length === 0) return;
      const colStart = indices[0];
      const colSpan = indices[indices.length-1] - indices[0] + 1;
      segments.push({ colStart, colSpan, event: ev });
    });
  });
  const laneCount = Math.max(assignLanes(segments), 1);

  el.weekGrid.innerHTML = '';
  el.weekGrid.style.gridTemplateRows = `auto repeat(${laneCount}, 44px)`;

  days.forEach((d, col) => {
    const header = document.createElement('div');
    header.className = 'col-header' + (isSameDay(d, today) ? ' is-today' : '');
    header.style.gridColumn = `${col+1} / span 1`;
    header.style.gridRow = '1';
    header.innerHTML = `<div class="wd">${WEEKDAYS_SHORT[d.getDay()]}</div><div class="dn">${d.getDate()}</div>`;
    el.weekGrid.appendChild(header);
  });

  days.forEach((d, col) => {
    const bg = document.createElement('div');
    bg.className = 'week-daybg' + (isSameDay(d, today) ? ' is-today-col' : '');
    bg.style.gridColumn = `${col+1} / span 1`;
    bg.style.gridRow = `2 / -1`;
    bg.addEventListener('click', () => openModal(null, d));
    el.weekGrid.appendChild(bg);
  });

  segments.forEach(seg => {
    const bar = document.createElement('div');
    bar.className = 'week-bar';
    bar.style.gridColumn = `${seg.colStart+1} / span ${seg.colSpan}`;
    bar.style.gridRow = `${seg.lane + 2}`;
    bar.style.background = seg.event.color || categoryColor(seg.event.category);
    const people = formatPeople(seg.event.people);
    bar.innerHTML = `<div class="wb-title">${escapeHtml(seg.event.title)}</div>
      <div class="wb-meta">${escapeHtml(categoryLabel(seg.event.category))}${people ? ' · ' + escapeHtml(people) : ''}</div>`;
    bar.title = pillTooltip(seg.event);
    bar.addEventListener('click', (e) => { e.stopPropagation(); openModal(seg.event); });
    el.weekGrid.appendChild(bar);
  });
}

function renderDay() {
  const day = state.cursor;
  const today = startOfDay(new Date());

  el.dayGrid.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'col-header' + (isSameDay(day, today) ? ' is-today' : '');
  header.innerHTML = `<div class="wd">${WEEKDAYS_SHORT[day.getDay()]}</div><div class="dn">${MONTHS[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}</div>`;
  el.dayGrid.appendChild(header);

  const list = document.createElement('div');
  list.className = 'col-events';
  const dayEvents = eventsOnDate(day);
  if (dayEvents.length === 0) {
    list.innerHTML = '<div class="col-empty">No entries for this day.</div>';
  } else {
    dayEvents.forEach(ev => list.appendChild(makeEntryCard(ev)));
  }
  el.dayGrid.appendChild(list);

  el.dayGrid.addEventListener('click', (e) => {
    if (e.target.closest('.entry-card')) return;
    openModal(null, day);
  });
}

function makeEntryCard(ev) {
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.style.background = ev.color || categoryColor(ev.category);
  card.innerHTML = `<div class="ec-title">${escapeHtml(ev.title)}</div>
    <div class="ec-people">${escapeHtml(categoryLabel(ev.category))}${formatPeople(ev.people) ? ' · ' + escapeHtml(formatPeople(ev.people)) : ''}</div>`;
  card.title = pillTooltip(ev);
  card.addEventListener('click', (e) => { e.stopPropagation(); openModal(ev); });
  return card;
}

function bindModal() {
  el.newEventBtn.addEventListener('click', () => openModal(null, state.cursor));
  el.modalClose.addEventListener('click', closeModal);
  el.cancelBtn.addEventListener('click', closeModal);
  el.modalBackdrop.addEventListener('click', (e) => { if (e.target === el.modalBackdrop) closeModal(); });

  el.addDateBtn.addEventListener('click', addDateFromInput);

  // Enter should never submit the form. Inside the People textarea, let it
  // do its normal job of adding a new line. Inside the date input, treat
  // Enter as "add this date" instead of submitting.
  el.eventForm.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target === el.dateInput) {
      e.preventDefault();
      addDateFromInput();
      return;
    }
    if (e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  el.eventForm.addEventListener('submit', onSaveEvent);
  el.deleteBtn.addEventListener('click', onDeleteEvent);
}

function addDateFromInput() {
  const val = el.dateInput.value;
  if (!val) return;
  if (!modalDates.includes(val)) {
    modalDates.push(val);
    modalDates.sort();
    renderDateChips();
  }
  el.dateInput.value = '';
}

function removeDate(dateKey) {
  modalDates = modalDates.filter(d => d !== dateKey);
  renderDateChips();
}

function renderDateChips() {
  el.dateChips.innerHTML = '';
  if (modalDates.length === 0) {
    el.dateChips.innerHTML = '<span class="date-chips-empty">No dates added yet — pick a date above and click "+ Add date".</span>';
    return;
  }
  modalDates.forEach(d => {
    const chip = document.createElement('span');
    chip.className = 'date-chip';
    chip.textContent = formatDateChip(d);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove date');
    removeBtn.addEventListener('click', () => removeDate(d));
    chip.appendChild(removeBtn);
    el.dateChips.appendChild(chip);
  });
}

function formatDateChip(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${MONTHS[m-1].slice(0,3)} ${d}, ${y}`;
}

function openModal(ev, defaultDate) {
  el.modalError.hidden = true;
  if (ev) {
    state.editingId = ev.id;
    el.modalTitle.textContent = 'Edit Entry';
    el.eventId.value = ev.id;
    el.eventTitle.value = ev.title || '';
    modalDates = ev.dates && ev.dates.length ? [...ev.dates] : (ev.date ? [ev.date] : []);
    el.eventPeople.value = ev.people || '';
    el.eventCategory.value = ev.category || '';
    el.deleteBtn.hidden = false;
  } else {
    state.editingId = null;
    el.modalTitle.textContent = 'New Entry';
    el.eventForm.reset();
    el.eventId.value = '';
    const d = defaultDate || new Date();
    modalDates = [toDateKey(d)];
    el.eventCategory.value = '';
    el.deleteBtn.hidden = true;
  }
  el.dateInput.value = toDateKey(new Date());
  renderDateChips();
  updateCategoryDot();
  el.modalBackdrop.hidden = false;
  el.eventTitle.focus();
}

function closeModal() {
  el.modalBackdrop.hidden = true;
  state.editingId = null;
}

async function onSaveEvent(e) {
  e.preventDefault();

  if (!el.eventCategory.value) {
    el.modalError.textContent = 'Please select a category.';
    el.modalError.hidden = false;
    return;
  }
  if (modalDates.length === 0) {
    el.modalError.textContent = 'Please add at least one date.';
    el.modalError.hidden = false;
    return;
  }

  const payload = {
    title: el.eventTitle.value.trim(),
    dates: [...modalDates].sort(),
    people: el.eventPeople.value.trim(),
    category: el.eventCategory.value,
    color: categoryColor(el.eventCategory.value),
    author: el.authorName.value.trim() || 'Anonymous',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (state.editingId) {
      await db.collection('events').doc(state.editingId).update(payload);
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('events').add(payload);
    }
    closeModal();
  } catch (err) {
    console.error(err);
    el.modalError.textContent = 'Could not save — check your Firebase config / connection.';
    el.modalError.hidden = false;
  }
}

async function onDeleteEvent() {
  if (!state.editingId) return;
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  try {
    await db.collection('events').doc(state.editingId).delete();
    closeModal();
  } catch (err) {
    console.error(err);
    el.modalError.textContent = 'Could not delete — check your connection.';
    el.modalError.hidden = false;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

init();
