import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

const TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

const CONFIDENCE_LEVELS = ['Certain', 'Confident', 'Unsure'];

const MAX_NAME_LENGTH = 100;
const MAX_NOTES_LENGTH = 2000;

// What we ask Supabase for.
// A person comes with all of their typings attached (the one-to-many link).
const TYPING_COLUMNS = 'id, person_id, typer, mbti, confidence, notes, created_at';
const PERSON_COLUMNS = 'id, name, created_at, typings(' + TYPING_COLUMNS + ')';

// Connect to Supabase. The URL and secret key come from the .env file
// (or Render's dashboard), so they never appear in the code or on GitHub.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Every request must have the shared password.
app.use(requirePassword);
// Let the server read JSON sent by the browser (request.body).
app.use(express.json());
// Hand out the files in frontend/ (index.html, app.js, styles.css) to the browser.
app.use(express.static(import.meta.dirname + '/../frontend'));


// ---------- Helpers ----------

// Turn a value into trimmed text, or '' if it isn't text.
function cleanText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

// Middleware: only lets people with the shared password through.
// The username can be anything.
function requirePassword(request, response, next) {
  const header = request.headers.authorization || '';

  const encoded = header.replace('Basic ', '');
  const decoded = Buffer.from(encoded, 'base64').toString();
  const password = decoded.slice(decoded.indexOf(':') + 1);

  if (password === process.env.APP_PASSWORD) {
    next();
    return;
  }

  // Wrong or missing: ask the browser to show its password popup.
  response.set('WWW-Authenticate', 'Basic realm="Type Database"');
  response.status(401).send('Password required.');
}

// Read the :id from the URL. Replies with 400 and returns null if it's not a whole number.
function readId(request, response) {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) {
    response.status(400).json({ error: 'Invalid id.' });
    return null;
  }
  return id;
}

// Check a person's name. Returns an error message, or '' if it's fine.
function checkName(name) {
  if (name === '') {
    return 'Name is required.';
  }
  if (name.length > MAX_NAME_LENGTH) {
    return 'Name is too long.';
  }
  return '';
}

// Check one typing sent by the browser.
// Returns { error: '...' } if something's wrong, otherwise { typing: {...} }.
function checkTyping(body) {
  const typer = cleanText(body.typer);
  const mbti = cleanText(body.mbti);
  const confidence = cleanText(body.confidence);
  const notes = cleanText(body.notes);

  if (typer === '') {
    return { error: 'Typed by is required.' };
  }
  if (!TYPES.includes(mbti)) {
    return { error: 'Type must be one of the 16 types.' };
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    return { error: 'Confidence must be Certain, Confident or Unsure.' };
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return { error: 'Notes are too long.' };
  }

  return {
    typing: {
      typer: typer,
      mbti: mbti,
      confidence: confidence,
      notes: notes === '' ? null : notes,   // store "no notes" as empty
    },
  };
}

// Log a Supabase error for us, and send the browser a short message.
function replyWithError(response, error, message) {
  console.error(error);
  response.status(500).json({ error: message });
}


// ---------- People ----------

// GET /people -> everyone, each with their typings.
async function getPeople(request, response) {
  const result = await supabase
    .from('people')
    .select(PERSON_COLUMNS)
    .order('created_at', { ascending: true })
    .order('created_at', { referencedTable: 'typings', ascending: true });

  if (result.error) {
    replyWithError(response, result.error, 'Could not load people.');
    return;
  }

  response.json(result.data);
}

// POST /people -> add a new person together with their first typing.
// Body: { name, typer, mbti, confidence, notes }
async function addPerson(request, response) {
  const body = request.body || {};

  const name = cleanText(body.name);
  const nameError = checkName(name);
  if (nameError) {
    response.status(400).json({ error: nameError });
    return;
  }

  const checked = checkTyping(body);
  if (checked.error) {
    response.status(400).json({ error: checked.error });
    return;
  }

  // 1. Create the person.
  const personResult = await supabase
    .from('people')
    .insert({ name: name })
    .select('id')
    .single();

  if (personResult.error) {
    replyWithError(response, personResult.error, 'Could not save person.');
    return;
  }

  const personId = personResult.data.id;

  // 2. Create their first typing, linked to them.
  checked.typing.person_id = personId;
  const typingResult = await supabase.from('typings').insert(checked.typing);

  if (typingResult.error) {
    // Don't leave a person with no typing behind: undo step 1.
    await supabase.from('people').delete().eq('id', personId);
    replyWithError(response, typingResult.error, 'Could not save typing.');
    return;
  }

  // 3. Send back the full person, typings included.
  const fullResult = await supabase
    .from('people')
    .select(PERSON_COLUMNS)
    .eq('id', personId)
    .single();

  if (fullResult.error) {
    replyWithError(response, fullResult.error, 'Saved, but could not reload person.');
    return;
  }

  response.status(201).json(fullResult.data);
}

// PATCH /people/:id -> rename a person. Body: { name }
async function renamePerson(request, response) {
  const id = readId(request, response);
  if (id === null) {
    return;
  }

  const name = cleanText((request.body || {}).name);
  const nameError = checkName(name);
  if (nameError) {
    response.status(400).json({ error: nameError });
    return;
  }

  const result = await supabase
    .from('people')
    .update({ name: name })
    .eq('id', id)
    .select('id, name');

  if (result.error) {
    replyWithError(response, result.error, 'Could not rename person.');
    return;
  }
  if (result.data.length === 0) {
    response.status(404).json({ error: 'Person not found.' });
    return;
  }

  response.json(result.data[0]);
}

// DELETE /people/:id -> remove a person. Their typings go too
// (the database does that because of "on delete cascade").
async function deletePerson(request, response) {
  const id = readId(request, response);
  if (id === null) {
    return;
  }

  const result = await supabase
    .from('people')
    .delete()
    .eq('id', id)
    .select('id');

  if (result.error) {
    replyWithError(response, result.error, 'Could not delete person.');
    return;
  }
  if (result.data.length === 0) {
    response.status(404).json({ error: 'Person not found.' });
    return;
  }

  response.status(204).end();
}


// ---------- Typings ----------

// POST /people/:id/typings -> add a typing to an existing person.
// Body: { typer, mbti, confidence, notes }
async function addTyping(request, response) {
  const personId = readId(request, response);
  if (personId === null) {
    return;
  }

  const checked = checkTyping(request.body || {});
  if (checked.error) {
    response.status(400).json({ error: checked.error });
    return;
  }

  checked.typing.person_id = personId;

  const result = await supabase
    .from('typings')
    .insert(checked.typing)
    .select(TYPING_COLUMNS)
    .single();

  if (result.error) {
    replyWithError(response, result.error, 'Could not save typing.');
    return;
  }

  response.status(201).json(result.data);
}

// PATCH /typings/:id -> change a typing. Body: { typer, mbti, confidence, notes }
async function updateTyping(request, response) {
  const id = readId(request, response);
  if (id === null) {
    return;
  }

  const checked = checkTyping(request.body || {});
  if (checked.error) {
    response.status(400).json({ error: checked.error });
    return;
  }

  const result = await supabase
    .from('typings')
    .update(checked.typing)
    .eq('id', id)
    .select(TYPING_COLUMNS);

  if (result.error) {
    replyWithError(response, result.error, 'Could not update typing.');
    return;
  }
  if (result.data.length === 0) {
    response.status(404).json({ error: 'Typing not found.' });
    return;
  }

  response.json(result.data[0]);
}

// DELETE /typings/:id -> remove one typing.
async function deleteTyping(request, response) {
  const id = readId(request, response);
  if (id === null) {
    return;
  }

  const result = await supabase
    .from('typings')
    .delete()
    .eq('id', id)
    .select('id');

  if (result.error) {
    replyWithError(response, result.error, 'Could not delete typing.');
    return;
  }
  if (result.data.length === 0) {
    response.status(404).json({ error: 'Typing not found.' });
    return;
  }

  response.status(204).end();
}


// Runs once, when the server has started.
function onServerStarted() {
  console.log('Server running at http://localhost:' + PORT);
}


// Connect each path to the function that handles it.
app.get('/people', getPeople);
app.post('/people', addPerson);
app.patch('/people/:id', renamePerson);
app.delete('/people/:id', deletePerson);

app.post('/people/:id/typings', addTyping);
app.patch('/typings/:id', updateTyping);
app.delete('/typings/:id', deleteTyping);

app.listen(PORT, onServerStarted);
