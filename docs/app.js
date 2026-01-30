import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const PEOPLE = [
  'CREAG',
  'ARGYLE',
  'JOE',
  'NICOLA',
  'CHIP DOUGLAS',
  'TOP DOG',
];

// --- state ---
let pendingDelta = null; // +1 / -1
let pendingPerson = null;
let selectedUser = null;
let titleTapCount = 0;
let titleTapTimer = null;

// --- dom ---
const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');

const screens = {
  main: document.getElementById('screen-main'),
  people: document.getElementById('screen-people'),
  story: document.getElementById('screen-story'),
  splash: document.getElementById('screen-splash'),
  scores: document.getElementById('screen-scores'),
  user: document.getElementById('screen-user'),
};

const btnMinus = document.getElementById('btn-minus');
const btnPlus = document.getElementById('btn-plus');
const btnScores = document.getElementById('btn-scores');
const btnPeopleBack = document.getElementById('btn-people-back');
const btnStoryBack = document.getElementById('btn-story-back');
const btnScoresBack = document.getElementById('btn-scores-back');
const btnHome = document.getElementById('btn-home');

const peopleGrid = document.getElementById('people-grid');
const scoresGrid = document.getElementById('scores-grid');

const storyTitle = document.getElementById('story-title');
const storyBox = document.getElementById('story');
const btnSubmit = document.getElementById('btn-submit');

const splashText = document.getElementById('splash-text');

const userNameEl = document.getElementById('user-name');
const userScoreEl = document.getElementById('user-score');
const userStoriesEl = document.getElementById('user-stories');

const adminModal = document.getElementById('modal-admin');
const adminPersonSel = document.getElementById('admin-person');
const adminResetPerson = document.getElementById('admin-reset-person');
const adminResetAll = document.getElementById('admin-reset-all');
const adminClose = document.getElementById('admin-close');

// --- helpers ---
function show(name){
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function fmtTs(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString([], { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch {
    return '';
  }
}

function requireConfig(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    statusEl.textContent = 'Missing Supabase config';
    alert('Supabase is not configured yet. Edit docs/config.js and paste SUPABASE_URL and SUPABASE_ANON_KEY.');
    return false;
  }
  return true;
}

// --- supabase ---
let supabase = null;
function initSupabase(){
  if(!requireConfig()) return;
  // supabase-js is loaded from CDN as window.supabase
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function ping(){
  if(!supabase){
    statusEl.textContent = 'Offline';
    return false;
  }
  try{
    const { error } = await supabase.from('people').select('name').limit(1);
    statusEl.textContent = error ? 'Offline' : 'Online';
    return !error;
  } catch {
    statusEl.textContent = 'Offline';
    return false;
  }
}

async function ensurePeopleSeeded(){
  // schema.sql already seeds, but this keeps dev environments sane.
  if(!supabase) return;
  const { data, error } = await supabase.from('people').select('name');
  if(error) throw error;
  const existing = new Set((data||[]).map(r => r.name));
  const missing = PEOPLE.filter(n => !existing.has(n));
  if(missing.length){
    // insert missing with score 0
    const rows = missing.map(name => ({ name, score: 0 }));
    const r = await supabase.from('people').insert(rows);
    if(r.error) throw r.error;
  }
}

async function fetchScores(){
  const { data, error } = await supabase
    .from('people')
    .select('name,score')
    .order('name', { ascending: true });
  if(error) throw error;
  const map = new Map();
  for(const r of data){ map.set(r.name, r.score); }
  return map;
}

async function fetchUser(name){
  const { data, error } = await supabase
    .from('people')
    .select('id,name,score')
    .eq('name', name)
    .single();
  if(error) throw error;
  return data;
}

async function fetchUserEvents(personId){
  const { data, error } = await supabase
    .from('events')
    .select('delta,story,created_at')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
    .limit(200);
  if(error) throw error;
  return data;
}

async function addEvent(name, delta, story){
  // Use RPC for atomic score update + event insert.
  const { data, error } = await supabase.rpc('add_event', { p_name: name, p_delta: delta, p_story: story });
  if(error) throw error;
  return data;
}

async function resetPerson(name){
  const { error } = await supabase.rpc('reset_person', { p_name: name });
  if(error) throw error;
}

async function resetAll(){
  const { error } = await supabase.rpc('reset_all');
  if(error) throw error;
}

// --- UI rendering ---
function renderPeopleGrid(){
  peopleGrid.innerHTML = '';
  for(const name of PEOPLE){
    const b = document.createElement('button');
    b.className = 'person';
    b.textContent = name;
    b.addEventListener('click', async () => {
      pendingPerson = name;
      storyTitle.textContent = `${pendingDelta === 1 ? 'PLUS' : 'MINUS'} for ${name}`;
      storyBox.value = '';
      show('story');
      storyBox.focus();
    });
    peopleGrid.appendChild(b);
  }
}

async function renderScoresGrid(){
  scoresGrid.innerHTML = '';
  const scores = await fetchScores();
  for(const name of PEOPLE){
    const b = document.createElement('button');
    b.className = 'person';
    const sc = scores.get(name);
    b.innerHTML = `${name}<small>Score: ${typeof sc === 'number' ? sc : '…'}</small>`;
    b.addEventListener('click', async () => {
      await openUser(name);
    });
    scoresGrid.appendChild(b);
  }
}

async function openUser(name){
  selectedUser = name;
  const u = await fetchUser(name);
  userNameEl.textContent = u.name;
  userScoreEl.textContent = u.score;

  const events = await fetchUserEvents(u.id);
  userStoriesEl.innerHTML = '';
  for(const e of events){
    const li = document.createElement('li');
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = fmtTs(e.created_at);

    const delta = document.createElement('span');
    delta.className = e.delta === 1 ? 'deltaPlus' : 'deltaMinus';
    delta.textContent = e.delta === 1 ? '(+)' : '(-)';

    const txt = document.createElement('span');
    txt.textContent = ` ${e.story}`;

    li.appendChild(ts);
    li.appendChild(delta);
    li.appendChild(txt);
    userStoriesEl.appendChild(li);
  }
  show('user');
}

function openAdmin(){
  adminPersonSel.innerHTML = '';
  for(const n of PEOPLE){
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    adminPersonSel.appendChild(opt);
  }
  adminModal.classList.remove('hidden');
}

function closeAdmin(){
  adminModal.classList.add('hidden');
}

// --- events ---
btnMinus.addEventListener('click', () => { pendingDelta = -1; renderPeopleGrid(); show('people'); });
btnPlus.addEventListener('click', () => { pendingDelta = 1; renderPeopleGrid(); show('people'); });

btnScores.addEventListener('click', async () => {
  await renderScoresGrid();
  show('scores');
});

btnPeopleBack.addEventListener('click', () => show('main'));
btnStoryBack.addEventListener('click', () => show('people'));
btnScoresBack.addEventListener('click', () => show('main'));
btnHome.addEventListener('click', () => show('main'));

btnSubmit.addEventListener('click', async () => {
  const story = storyBox.value.trim();
  if(!pendingPerson || !pendingDelta) return;
  if(!story){
    storyBox.focus();
    return;
  }
  if(!supabase){
    alert('Not connected to Supabase yet (missing config or offline).');
    return;
  }

  const ok = await ping();
  if(!ok){
    alert(
      'Submit failed: Offline.\n\nIf you just updated config.js, hard refresh the page (Ctrl+F5) or open in an incognito tab.\n\nAlso confirm your Supabase project is running and schema.sql succeeded.'
    );
    return;
  }

  try{
    btnSubmit.disabled = true;
    await addEvent(pendingPerson, pendingDelta, story);

    splashText.textContent = pendingDelta === 1 ? 'PLUS!' : 'MINUS!';
    splashText.style.color = pendingDelta === 1 ? 'var(--plus)' : 'var(--minus)';
    show('splash');

    // reset state and return to main after 2 seconds
    pendingPerson = null;
    pendingDelta = null;

    setTimeout(() => {
      show('main');
    }, 2000);
  } catch (e){
    console.error(e);
    const msg = e?.message || String(e);
    alert('Submit failed: ' + msg + '\n\n(See console for details)');
  } finally {
    btnSubmit.disabled = false;
  }
});

// 7-tap admin
function bumpTitleTap(){
  titleTapCount += 1;
  clearTimeout(titleTapTimer);
  titleTapTimer = setTimeout(() => { titleTapCount = 0; }, 900);
  if(titleTapCount >= 7){
    titleTapCount = 0;
    openAdmin();
  }
}

titleEl.addEventListener('click', bumpTitleTap);

titleEl.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' || e.key === ' ') bumpTitleTap();
});

adminClose.addEventListener('click', closeAdmin);
adminModal.addEventListener('click', (e) => {
  if(e.target === adminModal) closeAdmin();
});

adminResetPerson.addEventListener('click', async () => {
  const name = adminPersonSel.value;
  if(!confirm(`Reset ${name}? This deletes their stories.`)) return;
  try{
    await resetPerson(name);
    alert('Reset complete.');
  } catch(e){
    alert('Reset failed: ' + (e?.message || e));
  }
});

adminResetAll.addEventListener('click', async () => {
  if(!confirm('Reset ALL people and delete ALL stories?')) return;
  try{
    await resetAll();
    alert('Reset complete.');
  } catch(e){
    alert('Reset failed: ' + (e?.message || e));
  }
});

// --- init ---
initSupabase();
if(supabase){
  ensurePeopleSeeded()
    .then(() => ping())
    .catch((e) => {
      console.error(e);
      statusEl.textContent = 'Offline';
    });
  setInterval(() => ping().catch(() => {}), 8000);
}

show('main');
