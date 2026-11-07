// 1. Find the elements on the page we need to work with.
const form = document.getElementById('person-form');
const nameInput = document.getElementById('name');
const typeSelect = document.getElementById('type');
const typerInput = document.getElementById('typer');
const confidenceSelect = document.getElementById('confidence');
const peopleList = document.getElementById('people-list');

// Add one person to the list on the page.
// e.g. "Alice - INTJ (typed by Bob, certain)"
function showPerson(person) {
  const item = document.createElement('li');
  item.textContent = person.name + ' - ' + person.mbti +
    ' (typed by ' + person.typer + ', ' + person.confidence + ')';
  peopleList.appendChild(item);
}

// 2. When the page loads, ask the server for everyone and show them.
async function loadPeople() {
  const response = await fetch('/people');
  const people = await response.json();

  if (!response.ok) {
    alert(people.error);
    return;
  }

  peopleList.innerHTML = '';
  people.forEach(showPerson);
}

// 3. When the form is submitted, send the new person to the server.
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

  // The server saved it and sent it back, so show it.
  showPerson(result);
  form.reset();
  nameInput.focus();
}

form.addEventListener('submit', handleSubmit);

loadPeople();
