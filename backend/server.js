import express from 'express';

const app = express();
const PORT = 3000;

const TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

// Temporary storage: lives in the server's memory, so it's wiped when the
// server restarts. Step 4 replaces this with Supabase.
const people = [];

// Let the server read JSON sent by the browser (request.body).
app.use(express.json());

// Hand out the files in frontend/ (index.html, app.js) to the browser.
app.use(express.static(import.meta.dirname + '/../frontend'));


// GET /people -> send back everyone.
function getPeople(request, response) {
  response.json(people);
}

// POST /people -> add one person.
function addPerson(request, response) {
  const body = request.body || {};

  let name = '';
  if (typeof body.name === 'string') {
    name = body.name.trim();
  }
  const type = body.type;

  // Never trust the browser: check the data here too.
  if (name === '') {
    response.status(400).json({ error: 'Name is required.' });
    return;
  }
  if (!TYPES.includes(type)) {
    response.status(400).json({ error: 'Type must be one of the 16 types.' });
    return;
  }

  const person = { name: name, type: type };
  people.push(person);
  response.status(201).json(person);
}

// Runs once, when the server has started.
function onServerStarted() {
  console.log('Server running at http://localhost:' + PORT);
}


// Connect each path to the function that handles it.
app.get('/people', getPeople);
app.post('/people', addPerson);

app.listen(PORT, onServerStarted);
