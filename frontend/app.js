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

const addDialog = document.getElementById('add-dialog');
const openAddButton = document.getElementById('open-add');
const cancelAddButton = document.getElementById('cancel-add');
const form = document.getElementById('person-form');
const nameInput = document.getElementById('name');
const typeSelect = document.getElementById('type');
const typerInput = document.getElementById('typer');
const confidenceSelect = document.getElementById('confidence');


// ---------- 2. What the page remembers ----------
let allPeople = [];          // everyone, as loaded from the server
let sortKey = 'created_at';  // which column we're sorting by
let sortAscending = false;   // false = newest / Z / most sure first

// For each filterable column, the values currently ticked.
// An empty list means "no filter: show everyone".
const filters = {
  mbti: [],
  typer: [],
  confidence: [],
};

let openMenuKey = null;      // which column's dropdown is open, if any

// Confidence sorts by how sure, not alphabetically.
const CONFIDENCE_ORDER = { Certain: 3, Confident: 2, Unsure: 1 };

// Remember each heading's plain label ("Type", "By"...) before we add arrows.
headerButtons.forEach(function (button) {
  button.dataset.label = button.textContent;
});


// ---------- 3. Small helpers ----------

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

// The value shown (and filtered on) for a person in a given column.
function displayValue(person, key) {
  if (key === 'confidence') {
    return capitalise(person.confidence);
  }
  return String(person[key] || '').trim();
}

// The value used to sort a person by a given column.
function sortValue(person, key) {
  if (key === 'confidence') {
    return CONFIDENCE_ORDER[displayValue(person, key)] || 0;
  }
  if (key === 'created_at') {
    return new Date(person.created_at).getTime();
  }
  return displayValue(person, key).toLowerCase();
}

// Compare two people for sorting.
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

// Does this person match what's typed in the search box?
function matchesSearch(person, searchText) {
  if (searchText === '') {
    return true;
  }
  const haystack = (person.name + ' ' + person.mbti + ' ' + person.typer).toLowerCase();
  return haystack.includes(searchText);
}

// Does this person pass every ticked filter?
function matchesFilters(person) {
  return Object.keys(filters).every(function (key) {
    const ticked = filters[key];
    return ticked.length === 0 || ticked.includes(displayValue(person, key));
  });
}

function anyFilterActive() {
  return Object.keys(filters).some(function (key) {
    return filters[key].length > 0;
  });
}


// ---------- 4. Drawing the table ----------

function makeCell(text, className) {
  const cell = document.createElement('td');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

// A coloured label for a confidence level: strong green Certain, light green Confident.
function makeConfidencePill(confidence) {
  const pill = document.createElement('span');
  pill.className = 'pill pill-' + confidence.toLowerCase();
  pill.textContent = confidence;
  return pill;
}

function makeRow(person) {
  const row = document.createElement('tr');
  row.appendChild(makeCell(person.name, 'col-name'));
  row.appendChild(makeCell(person.mbti, 'col-type'));

  // The typer's name stays on one line.
  const byCell = makeCell(person.typer, 'col-by');
  byCell.title = person.typer;   // full name on hover, in case it's cut short
  row.appendChild(byCell);

  const sureCell = makeCell('', 'col-sure');
  sureCell.appendChild(makeConfidencePill(displayValue(person, 'confidence')));
  row.appendChild(sureCell);

  row.appendChild(makeCell(formatDate(person.created_at), 'col-date'));
  return row;
}

// Headings show an arrow when sorted, and "· 2" when 2 values are ticked.
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


// ---------- 5. The column dropdown (Type, By, Sure) ----------

// Every different value in a column, with how many people have it.
function columnValues(key) {
  const counts = {};
  allPeople.forEach(function (person) {
    const value = displayValue(person, key);
    counts[value] = (counts[value] || 0) + 1;
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

// Fill the menu for one column and show it under that column's heading.
function openMenu(button) {
  const key = button.dataset.key;
  openMenuKey = key;

  // The two sort choices. Confidence reads better as "most / least sure".
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

// Clicking anywhere outside the menu (or pressing Escape) closes it.
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


// ---------- 6. Talking to the server ----------

async function loadPeople() {
  const response = await fetch('/people');
  const result = await response.json();

  if (!response.ok) {
    alert(result.error);
    return;
  }

  allPeople = result;
  render();
}

async function handleSubmit(event) {
  event.preventDefault();

  const response = await fetch('/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameInput.value,
      mbti: typeSelect.value,
      typer: typerInput.value,
      confidence: confidenceSelect.value,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    alert(result.error);
    return;
  }

  allPeople.push(result);
  render();
  form.reset();
  addDialog.close();
}


// ---------- 7. Reacting to the user ----------

// Name and Added: clicking sorts (again flips). Type, By, Sure: opens the menu.
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

function openAddDialog() {
  closeMenu();
  addDialog.showModal();
  nameInput.focus();
}

function closeAddDialog() {
  form.reset();
  addDialog.close();
}

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
cancelAddButton.addEventListener('click', closeAddDialog);
form.addEventListener('submit', handleSubmit);

loadPeople();
