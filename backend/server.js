import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = 3000;

const TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

const CONFIDENCE_LEVELS = ['certain', 'confident', 'unsure'];
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Let the server read JSON sent by the browser (request.body).
app.use(express.json());

// Hand out the files in frontend/ (index.html, app.js) to the browser.
app.use(express.static(import.meta.dirname + '/../frontend'));


// Turn a value into trimmed text, or '' if it isn't text.
function cleanText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

// GET /people -> send back everyone.
async function getPeople(request, response) {
  const result = await supabase
    .from('main')
    .select('name, mbti, typer, confidence')
    .order('created_at', {ascending: true});
  
  if (result.error) {
    console.error(result.error);
    response.status(500).json({error: 'Could not load people.'});
    return;
  }

  response.json(result.data);
}

// POST /people -> add one person.
async function addPerson(request, response) {
  const body = request.body || {};

  const name = cleanText(body.name);
  const mbti = cleanText(body.mbti);
  const typer = cleanText(body.typer);
  const confidence = cleanText(body.confidence);

  // Never trust the browser: check the data here too.
  if (name === '') {
    response.status(400).json({ error: 'Name is required.' });
    return;
  }
  if (!TYPES.includes(mbti)) {
    response.status(400).json({ error: 'Type must be one of the 16 types.' });
    return;
  }
  if (typer === '') {
    response.status(400).json({ error: 'Typed by is required.' });
    return;
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    response.status(400).json({ error: 'Confidence must be certain, confident or unsure.' });
    return;
  }

  const newPerson = { name: name, mbti: mbti, typer: typer, confidence: confidence};

  const result = await supabase
    .from('main')
    .insert(newPerson)
    .select('name, mbti, typer, confidence')
    .single();

  if (result.error) {
    console.error(result.error);
    response.status(500).json({error: 'Could not save person'});
    return;
  }

  response.status(201).json(results.data);

}

// Runs once, when the server has started.
function onServerStarted() {
  console.log('Server running at http://localhost:' + PORT);
}


// Connect each path to the function that handles it.
app.get('/people', getPeople);
app.post('/people', addPerson);

app.listen(PORT, onServerStarted);
