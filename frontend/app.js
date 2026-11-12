// =====================================================================
// Type Database: the browser side.
//
// Data shape from the server (GET /people):
//   [ { id, name, created_at,
//       typings: [ { id, person_id, typer, mbti, confidence, notes, created_at }, ... ] },
//     ... ]
// One row in the table = one person. Their typings are everyone's opinions.
// =====================================================================


// ---------- 1. Find the elements on the page ----------
const page = document.querySelector('.page');
const rows = document.getElementById('people-rows');
const countLabel = document.getElementById('people-count');
const emptyMessage = document.getElementById('empty-message');
const searchInput = document.getElementById('search');
const headerButtons = document.querySelectorAll('.sort');

const columnMenu = document.getElementById('column-menu');
const menuSortButtons = columnMenu.querySelectorAll('.menu-sort');
const menuOptions = document.getElementById('menu-options');
const menuClearButton = document.getElementById('menu-clear');

// Add-person sheet
const addDialog = document.getElementById('add-dialog');
const addForm = document.getElementById('add-form');
const addName = document.getElementById('add-name');
const addMatches = document.getElementById('add-matches');
const addMatchesList = document.getElementById('add-matches-list');
const addTyper = document.getElementById('add-typer');
const addType = document.getElementById('add-type');
const addConfidence = document.getElementById('add-confidence');
const addNotes = document.getElementById('add-notes');
const openAddButton = document.getElementById('open-add');

// Person sheet
const personDialog = document.getElementById('person-dialog');
const personName = document.getElementById('person-name');
const personMeta = document.getElementById('person-meta');
const personSummary = document.getElementById('person-summary');
const typingList = document.getElementById('typing-list');
const typingForm = document.getElementById('typing-form');
const typingFormTitle = document.getElementById('typing-form-title');
const typingTyper = document.getElementById('typing-typer');
const typingType = document.getElementById('typing-type');
const typingConfidence = document.getElementById('typing-confidence');
const typingNotes = document.getElementById('typing-notes');
const typingSave = document.getElementById('typing-save');
const cancelEditButton = document.getElementById('cancel-edit');
const renameButton = document.getElementById('rename-person');
const deletePersonButton = document.getElementById('delete-person');


// ---------- 2. Fixed lists ----------
const TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];
const CONFIDENCE_LEVELS = ['Certain', 'Confident', 'Unsure'];

// "Sure" sorts by how sure. A split (people disagree on the type) comes last.
const CONFIDENCE_ORDER = { Certain: 3, Confident: 2, Unsure: 1, Split: 0 };


// ---------- 3. What the page remembers ----------
let allPeople = [];          // everyone, as loaded from the server
let sortKey = 'created_at';  // which column we're sorting by
let sortAscending = false;   // false = newest / Z / most sure first

// For each filterable column, the values currently ticked (empty = show everyone).
const filters = { mbti: [], typer: [], confidence: [] };

let openMenuKey = null;      // which column's dropdown is open, if any
let currentPersonId = null;  // whose panel is open
let editingTypingId = null;  // which typing is being edited (null = adding a new one)

headerButtons.forEach(function (button) {
  button.dataset.label = button.textContent;
});


// ---------- 4. Small helpers ----------

// "confident" -> "Confident"
function capitalise(text) {
  if (!text) {
    return '';
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// "2026-11-03T10:15:00Z" -> "3 Nov" (adds the year if it isn't this year)
function formatDate(isoText) {
  const date = new Date(isoText);
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = '2-digit';
  }
  return date.toLocaleDateString('en-AU', options);
}

// Fill a <select> with options, plus a blank "choose" option first.
function fillSelect(select, placeholder, values) {
  select.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = placeholder;
  select.appendChild(blank);

  values.forEach(function (value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

// Remember the name you type under, so you don't retype it every time.
// (Only in this browser. If storage isn't available, it just won't remember.)
function rememberTyper(name) {
  try {
    localStorage.setItem('typer-name', name);
  } catch (error) {
    // ignore
  }
}

function rememberedTyper() {
  try {
    return localStorage.getItem('typer-name') || '';
  } catch (error) {
    return '';
  }
}

// Ask the server something. Returns the reply, or shows an alert and returns null.
async function callServer(method, url, body) {
  const options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 204) {
    return {};
  }

  const result = await response.json();
  if (!response.ok) {
    alert(result.error || 'Something went wrong.');
    return null;
  }
  return result;
}

function findPerson(id) {
  return allPeople.find(function (person) {
    return person.id === id;
  });
}


// ---------- 5. Summarising a person's typings ----------

// Every different value in one field of a person's typings, most common first.
// e.g. a person typed INTJ, INTJ, INFJ -> ['INTJ', 'INFJ']
function distinctValues(person, field) {
  const counts = {};
  person.typings.forEach(function (typing) {
    const value = field === 'confidence' ? capitalise(typing.confidence) : typing[field];
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.keys(counts).sort(function (a, b) {
    return counts[b] - counts[a] || a.localeCompare(b);
  });
}

// The "Sure" summary for a person:
//   people disagree on the type -> "Split"
//   otherwise                   -> the most sure confidence anyone gave
function summaryConfidence(person) {
  if (distinctValues(person, 'mbti').length > 1) {
    return 'Split';
  }
  let best = '';
  person.typings.forEach(function (typing) {
    const confidence = capitalise(typing.confidence);
    if (best === '' || CONFIDENCE_ORDER[confidence] > CONFIDENCE_ORDER[best]) {
      best = confidence;
    }
  });
  return best;
}

// The values a person has for a filterable column (they may have several).
function personValues(person, key) {
  if (key === 'confidence') {
    return [summaryConfidence(person)];
  }
  return distinctValues(person, key);
}


// ---------- 6. Sorting, searching and filtering ----------

function sortValue(person, key) {
  if (key === 'confidence') {
    return CONFIDENCE_ORDER[summaryConfidence(person)] || 0;
  }
  if (key === 'created_at') {
    return new Date(person.created_at).getTime();
  }
  if (key === 'name') {
    return person.name.toLowerCase();
  }
  // Type and By: sort by the first (most common) value.
  return (personValues(person, key)[0] || '').toLowerCase();
}

function comparePeople(a, b) {
  const valueA = sortValue(a, sortKey);
  const valueB = sortValue(b, sortKey);

  let result = 0;
  if (valueA < valueB) {
    result = -1;
  } else if (valueA > valueB) {
    result = 1;
  }

  if (sortAscending) {
    return result;
  }
  return -result;
}

function matchesSearch(person, searchText) {
  if (searchText === '') {
    return true;
  }
  const words = [person.name];
  person.typings.forEach(function (typing) {
    words.push(typing.mbti, typing.typer);
  });
  return words.join(' ').toLowerCase().includes(searchText);
}

// A person passes a filter if ANY of their values for that column is ticked.
function matchesFilters(person) {
  return Object.keys(filters).every(function (key) {
    const ticked = filters[key];
    if (ticked.length === 0) {
      return true;
    }
    return personValues(person, key).some(function (value) {
      return ticked.includes(value);
    });
  });
}


// ---------- 7. Drawing the table ----------

// A coloured label: strong green Certain, light green Confident, black Split.
function makeConfidencePill(confidence) {
  const pill = document.createElement('span');
  pill.className = 'pill pill-' + confidence.toLowerCase();
  pill.textContent = confidence;
  return pill;
}

function makeCell(text, className) {
  const cell = document.createElement('td');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function makeRow(person) {
  const row = document.createElement('tr');

  // Name (a button, so the row can be opened with the keyboard too)
  const nameCell = makeCell('', 'col-name');
  const nameButton = document.createElement('button');
  nameButton.type = 'button';
  nameButton.className = 'name-button';
  nameButton.textContent = person.name;
  nameCell.appendChild(nameButton);
  row.appendChild(nameCell);

  // Type: every type people have suggested, one per line
  const typeCell = makeCell('', 'col-type');
  distinctValues(person, 'mbti').forEach(function (type) {
    const line = document.createElement('span');
    line.className = 'type-line';
    line.textContent = type;
    typeCell.appendChild(line);
  });
  row.appendChild(typeCell);

  // By: the typer's name, or "3 typers" if several people have typed them
  const typers = distinctValues(person, 'typer');
  let byText = typers[0] || '';
  if (typers.length > 1) {
    byText = typers.length + ' typers';
  }
  const byCell = makeCell(byText, 'col-by');
  byCell.title = typers.join(', ');
  row.appendChild(byCell);

  // Sure
  const sureCell = makeCell('', 'col-sure');
  sureCell.appendChild(makeConfidencePill(summaryConfidence(person)));
  row.appendChild(sureCell);

  // Date added
  row.appendChild(makeCell(formatDate(person.created_at), 'col-date'));

  function handleRowClick() {
    openPerson(person.id);
  }
  row.addEventListener('click', handleRowClick);

  return row;
}

function updateHeaderButtons() {
  headerButtons.forEach(function (button) {
    const key = button.dataset.key;
    const th = button.parentElement;
    let text = button.dataset.label;

    if (key === sortKey) {
      text += sortAscending ? ' ↑' : ' ↓';
      button.classList.add('active');
      th.setAttribute('aria-sort', sortAscending ? 'ascending' : 'descending');
    } else {
      button.classList.remove('active');
      th.removeAttribute('aria-sort');
    }

    if (filters[key] && filters[key].length > 0) {
      text += ' · ' + filters[key].length;
      button.classList.add('filtered');
    } else {
      button.classList.remove('filtered');
    }

    if (button.classList.contains('has-menu')) {
      button.setAttribute('aria-expanded', key === openMenuKey ? 'true' : 'false');
    }

    button.textContent = text;
  });
}

// Filter, sort and draw everyone. Called whenever anything changes.
function render() {
  const searchText = searchInput.value.trim().toLowerCase();

  const visible = allPeople
    .filter(function (person) {
      return matchesSearch(person, searchText) && matchesFilters(person);
    })
    .sort(comparePeople);

  rows.innerHTML = '';
  visible.forEach(function (person) {
    rows.appendChild(makeRow(person));
  });

  const total = allPeople.length + (allPeople.length === 1 ? ' person' : ' people');
  if (visible.length === allPeople.length) {
    countLabel.textContent = total;
  } else {
    countLabel.textContent = visible.length + ' of ' + total;
  }

  if (allPeople.length === 0) {
    emptyMessage.textContent = 'No one yet. Add your first person.';
    emptyMessage.hidden = false;
  } else if (visible.length === 0) {
    emptyMessage.textContent = 'No one matches your search or filters.';
    emptyMessage.hidden = false;
  } else {
    emptyMessage.hidden = true;
  }

  updateHeaderButtons();
}


// ---------- 8. The column dropdown (Type, By, Sure) ----------

// Every value in a column, with how many people have it.
function columnValues(key) {
  const counts = {};
  allPeople.forEach(function (person) {
    personValues(person, key).forEach(function (value) {
      counts[value] = (counts[value] || 0) + 1;
    });
  });

  const values = Object.keys(counts);
  if (key === 'confidence') {
    values.sort(function (a, b) {
      return (CONFIDENCE_ORDER[b] || 0) - (CONFIDENCE_ORDER[a] || 0);
    });
  } else {
    values.sort();
  }

  return values.map(function (value) {
    return { value: value, count: counts[value] };
  });
}

function makeOption(key, item) {
  const label = document.createElement('label');
  label.className = 'menu-option';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = filters[key].includes(item.value);

  function handleTick() {
    if (checkbox.checked) {
      filters[key].push(item.value);
    } else {
      filters[key] = filters[key].filter(function (v) { return v !== item.value; });
    }
    render();
  }
  checkbox.addEventListener('change', handleTick);

  const text = document.createElement('span');
  text.className = 'option-label';
  if (key === 'confidence') {
    text.appendChild(makeConfidencePill(item.value));
  } else {
    text.textContent = item.value;
  }

  const count = document.createElement('span');
  count.className = 'option-count';
  count.textContent = item.count;

  label.appendChild(checkbox);
  label.appendChild(text);
  label.appendChild(count);
  return label;
}

function openMenu(button) {
  const key = button.dataset.key;
  openMenuKey = key;

  const upLabel = key === 'confidence' ? 'Least sure first' : 'Sort A → Z';
  const downLabel = key === 'confidence' ? 'Most sure first' : 'Sort Z → A';
  menuSortButtons.forEach(function (sortButton) {
    const ascending = sortButton.dataset.direction === 'up';
    sortButton.textContent = ascending ? upLabel : downLabel;
    sortButton.classList.toggle('active', sortKey === key && sortAscending === ascending);
  });

  menuOptions.innerHTML = '';
  columnValues(key).forEach(function (item) {
    menuOptions.appendChild(makeOption(key, item));
  });

  // Position it below the heading, kept inside the page.
  columnMenu.hidden = false;
  const pageBox = page.getBoundingClientRect();
  const buttonBox = button.getBoundingClientRect();
  const maxLeft = page.clientWidth - columnMenu.offsetWidth - 8;
  const left = Math.max(8, Math.min(buttonBox.left - pageBox.left, maxLeft));
  columnMenu.style.left = left + 'px';
  columnMenu.style.top = (buttonBox.bottom - pageBox.top + 4) + 'px';

  updateHeaderButtons();
}

function closeMenu() {
  if (openMenuKey === null) {
    return;
  }
  openMenuKey = null;
  columnMenu.hidden = true;
  updateHeaderButtons();
}

function handleMenuSort(event) {
  sortKey = openMenuKey;
  sortAscending = event.currentTarget.dataset.direction === 'up';
  closeMenu();
  render();
}

function handleMenuClear() {
  filters[openMenuKey] = [];
  closeMenu();
  render();
}

function handleDocumentClick(event) {
  const clickedHeading = event.target.closest('.has-menu');
  if (!columnMenu.contains(event.target) && !clickedHeading) {
    closeMenu();
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    closeMenu();
  }
}

function handleHeaderClick(event) {
  const button = event.currentTarget;
  const key = button.dataset.key;

  if (button.classList.contains('has-menu')) {
    if (openMenuKey === key) {
      closeMenu();
    } else {
      openMenu(button);
    }
    return;
  }

  closeMenu();
  if (key === sortKey) {
    sortAscending = !sortAscending;
  } else {
    sortKey = key;
    sortAscending = key !== 'created_at';   // dates start newest-first, names A-Z
  }
  render();
}


// ---------- 9. The person panel ----------

function makeTyping(typing) {
  const box = document.createElement('article');
  box.className = 'typing';
  if (typing.id === editingTypingId) {
    box.classList.add('editing');
  }

  // Top line: who typed them, and as what
  const top = document.createElement('div');
  top.className = 'typing-top';

  const who = document.createElement('span');
  who.className = 'typing-who';
  who.textContent = typing.typer;

  const what = document.createElement('span');
  what.className = 'typing-what';
  what.textContent = typing.mbti;
  what.appendChild(makeConfidencePill(capitalise(typing.confidence)));

  top.appendChild(who);
  top.appendChild(what);
  box.appendChild(top);

  // Their reasoning, if they left any
  if (typing.notes) {
    const notes = document.createElement('p');
    notes.className = 'typing-notes';
    notes.textContent = typing.notes;
    box.appendChild(notes);
  }

  // Bottom line: date, Edit, Delete
  const bottom = document.createElement('div');
  bottom.className = 'typing-bottom';

  const date = document.createElement('span');
  date.className = 'muted';
  date.textContent = formatDate(typing.created_at);

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'text-button';
  editButton.textContent = 'Edit';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'text-button';
  deleteButton.textContent = 'Delete';

  function handleEdit() {
    startEditing(typing);
  }

  async function handleDelete() {
    const person = findPerson(currentPersonId);
    const isLast = person.typings.length === 1;
    const question = isLast
      ? 'This is ' + person.name + "'s only typing. Delete it and remove " + person.name + ' from the list?'
      : 'Delete ' + typing.typer + "'s typing of " + person.name + '?';
    if (!confirm(question)) {
      return;
    }

    // A person with no typings left is removed entirely.
    const url = isLast ? '/people/' + person.id : '/typings/' + typing.id;
    const result = await callServer('DELETE', url);
    if (result === null) {
      return;
    }

    if (isLast) {
      allPeople = allPeople.filter(function (p) { return p.id !== person.id; });
      personDialog.close();
    } else {
      person.typings = person.typings.filter(function (t) { return t.id !== typing.id; });
      drawPerson();
    }
    render();
  }

  editButton.addEventListener('click', handleEdit);
  deleteButton.addEventListener('click', handleDelete);

  bottom.appendChild(date);
  bottom.appendChild(editButton);
  bottom.appendChild(deleteButton);
  box.appendChild(bottom);

  return box;
}

// Draw the open person's panel from allPeople.
function drawPerson() {
  const person = findPerson(currentPersonId);
  if (!person) {
    return;
  }

  personName.textContent = person.name;
  const count = person.typings.length;
  personMeta.textContent = 'Added ' + formatDate(person.created_at) + ' · ' +
    count + (count === 1 ? ' typing' : ' typings');

  // Summary: the type(s) and the Sure label
  personSummary.innerHTML = '';
  const types = document.createElement('span');
  types.textContent = distinctValues(person, 'mbti').join(' / ');
  personSummary.appendChild(types);
  personSummary.appendChild(makeConfidencePill(summaryConfidence(person)));

  typingList.innerHTML = '';
  person.typings.forEach(function (typing) {
    typingList.appendChild(makeTyping(typing));
  });
}

// Put the typing form back to "add a new typing".
function resetTypingForm() {
  editingTypingId = null;
  typingForm.reset();
  typingTyper.value = rememberedTyper();
  typingFormTitle.textContent = 'Add your typing';
  typingSave.textContent = 'Add typing';
  cancelEditButton.hidden = true;
}

function startEditing(typing) {
  editingTypingId = typing.id;
  typingTyper.value = typing.typer;
  typingType.value = typing.mbti;
  typingConfidence.value = capitalise(typing.confidence);
  typingNotes.value = typing.notes || '';
  typingFormTitle.textContent = 'Edit ' + typing.typer + "'s typing";
  typingSave.textContent = 'Save changes';
  cancelEditButton.hidden = false;
  drawPerson();
  typingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleCancelEdit() {
  resetTypingForm();
  drawPerson();
}

function openPerson(id) {
  closeMenu();
  currentPersonId = id;
  resetTypingForm();
  drawPerson();
  if (!personDialog.open) {
    personDialog.showModal();
  }
  personDialog.scrollTop = 0;
}

// Add a new typing, or save changes to the one being edited.
async function handleTypingSubmit(event) {
  event.preventDefault();

  const person = findPerson(currentPersonId);
  const body = {
    typer: typingTyper.value,
    mbti: typingType.value,
    confidence: typingConfidence.value,
    notes: typingNotes.value,
  };

  let result;
  if (editingTypingId === null) {
    result = await callServer('POST', '/people/' + person.id + '/typings', body);
    if (result === null) {
      return;
    }
    person.typings.push(result);
  } else {
    result = await callServer('PATCH', '/typings/' + editingTypingId, body);
    if (result === null) {
      return;
    }
    person.typings = person.typings.map(function (t) {
      return t.id === result.id ? result : t;
    });
  }

  rememberTyper(body.typer.trim());
  resetTypingForm();
  drawPerson();
  render();
}

async function handleRename() {
  const person = findPerson(currentPersonId);
  const newName = prompt('Rename ' + person.name + ' to:', person.name);
  if (newName === null || newName.trim() === '' || newName.trim() === person.name) {
    return;
  }

  const result = await callServer('PATCH', '/people/' + person.id, { name: newName });
  if (result === null) {
    return;
  }

  person.name = result.name;
  drawPerson();
  render();
}

async function handleDeletePerson() {
  const person = findPerson(currentPersonId);
  const count = person.typings.length;
  const question = 'Delete ' + person.name + ' and all ' + count +
    (count === 1 ? ' typing' : ' typings') + '? This can\'t be undone.';
  if (!confirm(question)) {
    return;
  }

  const result = await callServer('DELETE', '/people/' + person.id);
  if (result === null) {
    return;
  }

  allPeople = allPeople.filter(function (p) { return p.id !== person.id; });
  personDialog.close();
  render();
}


// ---------- 10. The add-person sheet ----------

// While typing a name, show people already in the list with a similar name.
function showMatches() {
  const text = addName.value.trim().toLowerCase();
  addMatchesList.innerHTML = '';

  if (text.length < 2) {
    addMatches.hidden = true;
    return;
  }

  const matches = allPeople.filter(function (person) {
    return person.name.toLowerCase().includes(text);
  }).slice(0, 5);

  matches.forEach(function (person) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'match-button';

    const name = document.createElement('span');
    name.textContent = person.name;

    const info = document.createElement('span');
    info.className = 'muted';
    info.textContent = distinctValues(person, 'mbti').join(' / ') + ' · ' +
      person.typings.length + (person.typings.length === 1 ? ' typing' : ' typings');

    function handleMatchClick() {
      addDialog.close();
      openPerson(person.id);
    }
    button.addEventListener('click', handleMatchClick);

    button.appendChild(name);
    button.appendChild(info);
    addMatchesList.appendChild(button);
  });

  addMatches.hidden = matches.length === 0;
}

function openAddDialog() {
  closeMenu();
  addForm.reset();
  addTyper.value = rememberedTyper();
  addMatches.hidden = true;
  addDialog.showModal();
  addName.focus();
}

async function handleAddSubmit(event) {
  event.preventDefault();

  const body = {
    name: addName.value,
    typer: addTyper.value,
    mbti: addType.value,
    confidence: addConfidence.value,
    notes: addNotes.value,
  };

  const result = await callServer('POST', '/people', body);
  if (result === null) {
    return;
  }

  rememberTyper(body.typer.trim());
  allPeople.push(result);
  addDialog.close();
  render();
}


// ---------- 11. Loading ----------

async function loadPeople() {
  const result = await callServer('GET', '/people');
  if (result === null) {
    return;
  }
  allPeople = result;
  render();
}


// ---------- 12. Connect everything ----------

fillSelect(addType, 'Choose a type', TYPES);
fillSelect(typingType, 'Choose a type', TYPES);
fillSelect(addConfidence, 'How sure are you?', CONFIDENCE_LEVELS);
fillSelect(typingConfidence, 'How sure are you?', CONFIDENCE_LEVELS);

headerButtons.forEach(function (button) {
  button.addEventListener('click', handleHeaderClick);
});
menuSortButtons.forEach(function (button) {
  button.addEventListener('click', handleMenuSort);
});
menuClearButton.addEventListener('click', handleMenuClear);
document.addEventListener('click', handleDocumentClick);
document.addEventListener('keydown', handleKeydown);
searchInput.addEventListener('input', render);

openAddButton.addEventListener('click', openAddDialog);
addName.addEventListener('input', showMatches);
addForm.addEventListener('submit', handleAddSubmit);

typingForm.addEventListener('submit', handleTypingSubmit);
cancelEditButton.addEventListener('click', handleCancelEdit);
renameButton.addEventListener('click', handleRename);
deletePersonButton.addEventListener('click', handleDeletePerson);

// Every "Close" / "Cancel" button closes the sheet it's in.
document.querySelectorAll('[data-close]').forEach(function (button) {
  function handleClose() {
    button.closest('dialog').close();
  }
  button.addEventListener('click', handleClose);
});

loadPeople();
