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
  people: [],
  editingId: null,
};

let modalDates = [];  // array of 'YYYY-MM-DD' strings for the entry currently open in the modal
let modalPeople = []; // array of selected person names for the entry currently open in the modal

let personModalName = null;
let personModalDate = startOfDay(new Date());

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

// Returns an entry's people as a clean array, whether it was saved in the
// new array format or the old newline-separated string format.
function peopleArray(people) {
  if (!people) return [];
  if (Array.isArray(people)) return people.filter(Boolean);
  return people.split('\n').map(s => s.trim()).filter(Boolean);
}

const el = {
  tabs: document.querySelectorAll('.tab'),
  views: { month: document.getElementById('monthView'), week: document.getElementById('weekView'), day: document.getElementById('dayView'), people: document.getElementById('peopleView') },
  miniNav: document.querySelector('.mini-nav'),
  monthWeekdayRow: document.getElementById('monthWeekdayRow'),
  monthGrid: document.getElementById('monthGrid'),
  weekGrid: document.getElementById('weekGrid'),
  dayGrid: document.getElementById('dayGrid'),
  currentLabel: document.getElementById('currentLabel'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  jumpDateBtn: document.getElementById('jumpDateBtn'),
  jumpDateInput: document.getElementById('jumpDateInput'),
  todayBtn: document.getElementById('todayBtn'),
  newEventBtn: document.getElementById('newEventBtn'),
  legendList: document.getElementById('legendList'),
  authorName: document.getElementById('authorName'),
  connectionBanner: document.getElementById('connectionBanner'),

  peopleList: document.getElementById('peopleList'),
  peopleListSearch: document.getElementById('peopleListSearch'),
  newPersonInput: document.getElementById('newPersonInput'),
  addPersonBtn: document.getElementById('addPersonBtn'),

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
  peopleSelect: document.getElementById('peopleSelect'),
  peopleSelectBtn: document.getElementById('peopleSelectBtn'),
  peopleDropdown: document.getElementById('peopleDropdown'),
  peopleSearchInput: document.getElementById('peopleSearchInput'),
  peopleChecklist: document.getElementById('peopleChecklist'),
  peopleChips: document.getElementById('peopleChips'),
  eventCategory: document.getElementById('eventCategory'),
  categoryColorDot: document.getElementById('categoryColorDot'),
  modalError: document.getElementById('modalError'),

  personModalBackdrop: document.getElementById('personModalBackdrop'),
  personModalName: document.getElementById('personModalName'),
  personModalClose: document.getElementById('personModalClose'),
  personDayLabel: document.getElementById('personDayLabel'),
  personPrevDay: document.getElementById('personPrevDay'),
  personNextDay: document.getElementById('personNextDay'),
  personEntries: document.getElementById('personEntries'),
};

function init() {
  restoreAuthorName();
  buildCategoryDropdown();
  bindNav();
  bindModal();
  bindPeopleTab();
  bindPersonModal();
  subscribeToEvents();
  subscribeToPeople();
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

      const isPeopleView = state.view === 'people';
      el.miniNav.hidden = isPeopleView;
      el.todayBtn.hidden = isPeopleView;

      render();
    });
  });

  el.prevBtn.addEventListener('click', () => step(-1));
  el.nextBtn.addEventListener('click', () => step(1));
  el.todayBtn.addEventListener('click', () => { state.cursor = startOfDay(new Date()); render(); });
  el.newEventBtn.addEventListener('click', () => openModal(null, state.cursor));

  el.jumpDateBtn.addEventListener('click', () => {
    el.jumpDateInput.value = toDateKey(state.cursor);
    if (typeof el.jumpDateInput.showPicker === 'function') {
      try { el.jumpDateInput.showPicker(); return; } catch (e) { /* fall through */ }
    }
    el.jumpDateInput.focus();
    el.jumpDateInput.click();
  });
  el.jumpDateInput.addEventListener('change', () => {
    if (!el.jumpDateInput.value) return;
    state.cursor = new Date(el.jumpDateInput.value + 'T00:00:00');
    render();
  });
}

function step(dir) {
  if (state.view === 'month') state.cursor = addMonths(state.cursor, dir);
  else if (state.view === 'week') state.cursor = addDays(state.cursor, dir * 7);
  else state.cursor = addDays(state.cursor, dir);
  render();
}

function subscribeToEvents() {
  el.connectionBanner.hidden = false;
  el.connectionBanner.textContent = 'Connecting to shared calendar…';

  const slowTimer = setTimeout(() => {
    el.connectionBanner.textContent = 'Still connecting… this can take longer on some office/school networks. If this doesn\u2019t clear in ~15s, try a different network (e.g. mobile hotspot) or check with whoever manages your network.';
  }, 6000);

  db.collection('events').onSnapshot(
    snap => {
      clearTimeout(slowTimer);
      el.connectionBanner.hidden = true;
      state.events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      render();
    },
    err => {
      clearTimeout(slowTimer);
      el.connectionBanner.hidden = false;
      el.connectionBanner.textContent = 'Could not connect to the shared calendar — check js/firebase-config.js';
      console.error(err);
    }
  );
}

function subscribeToPeople() {
  db.collection('people').orderBy('name').onSnapshot(
    snap => {
      state.people = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (state.view === 'people') renderPeopleList();
      if (!el.modalBackdrop.hidden) renderPeopleChecklist(el.peopleSearchInput.value);
      if (!el.personModalBackdrop.hidden) renderPersonModal();
    },
    err => console.error('People sync error:', err)
  );
}

function render() {
  if (state.view === 'people') {
    renderPeopleList();
    return;
  }
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
  return peopleArray(people).join(', ');
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
  const laneCount = Math.max(assignLanes(segments), 6);

  el.weekGrid.innerHTML = '';
  el.weekGrid.style.gridTemplateRows = `auto repeat(${laneCount}, 22px)`;

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
    bar.textContent = seg.event.title;
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

function bindPeopleTab() {
  el.addPersonBtn.addEventListener('click', addPerson);
  el.newPersonInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPerson();
    }
  });
  el.peopleListSearch.addEventListener('input', renderPeopleList);
}

async function addPerson() {
  const name = el.newPersonInput.value.trim();
  if (!name) return;
  const exists = state.people.some(p => p.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    el.newPersonInput.value = '';
    return;
  }
  try {
    await db.collection('people').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    el.newPersonInput.value = '';
    el.newPersonInput.focus();
  } catch (err) {
    console.error(err);
    alert('Could not add person — check your connection.');
  }
}

async function removePerson(id, name) {
  if (!confirm(`Remove "${name}" from the people list? This won't affect any existing calendar entries.`)) return;
  try {
    await db.collection('people').doc(id).delete();
  } catch (err) {
    console.error(err);
    alert('Could not remove person — check your connection.');
  }
}

function renderPeopleList() {
  const filter = (el.peopleListSearch.value || '').trim().toLowerCase();
  const visible = filter
    ? state.people.filter(p => p.name.toLowerCase().includes(filter))
    : state.people;

  el.peopleList.innerHTML = '';

  if (state.people.length === 0) {
    el.peopleList.innerHTML = '<div class="people-list-empty">No people added yet. Use the field above to add your first officemate.</div>';
    return;
  }
  if (visible.length === 0) {
    el.peopleList.innerHTML = '<div class="people-list-empty">No matches for that search.</div>';
    return;
  }

  visible.forEach(person => {
    const row = document.createElement('div');
    row.className = 'person-row';

    const name = document.createElement('span');
    name.className = 'person-row-name';
    name.textContent = person.name;
    row.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'person-row-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${person.name}`);
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removePerson(person.id, person.name); });
    row.appendChild(removeBtn);

    row.addEventListener('click', () => openPersonModal(person.name));
    el.peopleList.appendChild(row);
  });
}

function bindModal() {
  el.newEventBtn.addEventListener('click', () => openModal(null, state.cursor));
  el.modalClose.addEventListener('click', closeModal);
  el.cancelBtn.addEventListener('click', closeModal);
  el.modalBackdrop.addEventListener('click', (e) => { if (e.target === el.modalBackdrop) closeModal(); });

  el.addDateBtn.addEventListener('click', addDateFromInput);

  el.peopleSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !el.peopleDropdown.hidden;
    if (isOpen) {
      el.peopleDropdown.hidden = true;
    } else {
      el.peopleSearchInput.value = '';
      renderPeopleChecklist('');
      el.peopleDropdown.hidden = false;
      el.peopleSearchInput.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!el.peopleDropdown.hidden && !el.peopleSelect.contains(e.target)) {
      el.peopleDropdown.hidden = true;
    }
  });
  el.peopleSearchInput.addEventListener('input', () => renderPeopleChecklist(el.peopleSearchInput.value));
  el.peopleChecklist.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const name = e.target.value;
    if (e.target.checked) {
      if (!modalPeople.includes(name)) modalPeople.push(name);
    } else {
      modalPeople = modalPeople.filter(p => p !== name);
    }
    renderPeopleChips();
  });

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

function renderPeopleChecklist(filterText) {
  const filter = (filterText || '').trim().toLowerCase();
  el.peopleChecklist.innerHTML = '';

  if (state.people.length === 0) {
    el.peopleChecklist.innerHTML = '<div class="people-checklist-empty">No people added yet — add some in the People tab first.</div>';
    return;
  }

  const filtered = state.people.filter(p => p.name.toLowerCase().includes(filter));
  if (filtered.length === 0) {
    el.peopleChecklist.innerHTML = '<div class="people-checklist-empty">No matches.</div>';
    return;
  }

  filtered.forEach(person => {
    const row = document.createElement('label');
    row.className = 'people-check-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = person.name;
    checkbox.checked = modalPeople.includes(person.name);
    row.appendChild(checkbox);
    row.appendChild(document.createTextNode(person.name));
    el.peopleChecklist.appendChild(row);
  });
}

function renderPeopleChips() {
  el.peopleChips.innerHTML = '';
  modalPeople.slice().sort().forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'date-chip';
    chip.textContent = name;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${name}`);
    removeBtn.addEventListener('click', () => {
      modalPeople = modalPeople.filter(p => p !== name);
      renderPeopleChips();
      renderPeopleChecklist(el.peopleSearchInput.value);
    });
    chip.appendChild(removeBtn);
    el.peopleChips.appendChild(chip);
  });
  el.peopleSelectBtn.textContent = modalPeople.length === 0
    ? 'Select people…'
    : `${modalPeople.length} selected`;
  el.peopleSelectBtn.classList.toggle('has-selection', modalPeople.length > 0);
}

function openModal(ev, defaultDate) {
  el.modalError.hidden = true;
  if (ev) {
    state.editingId = ev.id;
    el.modalTitle.textContent = 'Edit Entry';
    el.eventId.value = ev.id;
    el.eventTitle.value = ev.title || '';
    modalDates = ev.dates && ev.dates.length ? [...ev.dates] : (ev.date ? [ev.date] : []);
    modalPeople = peopleArray(ev.people);
    el.eventCategory.value = ev.category || '';
    el.deleteBtn.hidden = false;
  } else {
    state.editingId = null;
    el.modalTitle.textContent = 'New Entry';
    el.eventForm.reset();
    el.eventId.value = '';
    const d = defaultDate || new Date();
    modalDates = [toDateKey(d)];
    modalPeople = [];
    el.eventCategory.value = '';
    el.deleteBtn.hidden = true;
  }
  el.dateInput.value = toDateKey(new Date());
  renderDateChips();
  el.peopleDropdown.hidden = true;
  renderPeopleChips();
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
    people: [...modalPeople].sort(),
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

function bindPersonModal() {
  el.personModalClose.addEventListener('click', closePersonModal);
  el.personModalBackdrop.addEventListener('click', (e) => { if (e.target === el.personModalBackdrop) closePersonModal(); });
  el.personPrevDay.addEventListener('click', () => { personModalDate = addDays(personModalDate, -1); renderPersonModal(); });
  el.personNextDay.addEventListener('click', () => { personModalDate = addDays(personModalDate, 1); renderPersonModal(); });
}

function openPersonModal(name) {
  personModalName = name;
  personModalDate = startOfDay(new Date());
  renderPersonModal();
  el.personModalBackdrop.hidden = false;
}

function closePersonModal() {
  el.personModalBackdrop.hidden = true;
}

function renderPersonModal() {
  el.personModalName.textContent = personModalName;
  el.personDayLabel.textContent = `${WEEKDAYS_SHORT[personModalDate.getDay()]}, ${MONTHS[personModalDate.getMonth()].slice(0,3)} ${personModalDate.getDate()}, ${personModalDate.getFullYear()}`;

  const key = toDateKey(personModalDate);
  const nameLower = personModalName.toLowerCase();
  const matches = state.events.filter(ev =>
    eventDates(ev).includes(key) &&
    peopleArray(ev.people).some(p => p.toLowerCase() === nameLower)
  );

  el.personEntries.innerHTML = '';
  if (matches.length === 0) {
    el.personEntries.innerHTML = '<div class="person-entries-empty">No entries for this person on this day.</div>';
    return;
  }

  matches.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.style.background = ev.color || categoryColor(ev.category);
    const others = peopleArray(ev.people).filter(p => p.toLowerCase() !== nameLower);
    card.innerHTML = `<div class="ec-title">${escapeHtml(ev.title)}</div>
      <div class="ec-people">${escapeHtml(categoryLabel(ev.category))}${others.length ? ' · with ' + escapeHtml(others.join(', ')) : ''}</div>`;
    card.addEventListener('click', () => {
      closePersonModal();
      openModal(ev);
    });
    el.personEntries.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

init();
