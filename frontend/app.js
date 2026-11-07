// 1. Find the elements on the page we need to work with.
const form = document.getElementById('person-form');
const nameInput = document.getElementById('name');
const typeSelect = document.getElementById('type');
const peopleList = document.getElementById('people-list');

// Add one person to the list on the page.
function showPerson(person) {
  const item = document.createElement('li');
  item.textContent = person.name + ' - ' + person.type;
  peopleList.appendChild(item);
}

// 2. When the page loads, ask the server for everyone and show them.
async function loadPeople() {
  const response = await fetch('/people');
  const people = await response.json();
  peopleList.innerHTML = '';
  people.forEach(showPerson);
}

// 3. When the form is submitted, send the new person to the server.
form.addEventListener('submit', async function (event) {
  event.preventDefault();

  const response = await fetch('/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameInput.value,
      type: typeSelect.value,
    }),
  });

  if (!response.ok) {
    const result = await response.json();
    alert(result.error);
    return;
  }

  // The server saved it and sent it back, so show it.
  showPerson(await response.json());
  form.reset();
  nameInput.focus();
});

loadPeople();
