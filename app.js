/* ════════════════════════════════════════════════
   Step Up Export English Diagnostic Test
   app.js — v1.0
   Vanilla JS · localStorage · Google Apps Script
════════════════════════════════════════════════ */

'use strict';

/* ── Google Apps Script endpoint ──────────────── */
const GOOGLE_SCRIPT_POST_URL =
  'https://script.google.com/macros/s/AKfycbwkQl9IgktP0jqNFJ6RKi8mfQsFO4vclJYvRKMFUdeMMV9yQEUpMzr8SYcmPIP97WvN/exec';

/* ── localStorage keys ─────────────────────────── */
const LS_SESSION   = 'stepup_export_session';
const LS_RESPONSES = 'stepup_export_responses';

/* ── Diagnostic items array ──────────────────── */
const DIAGNOSTIC_ITEMS_EXPORT = [
  {
    question_id:            'EXD001',
    export_situation:       'First contact with a potential buyer',
    communicative_function: 'Presenting the company',
    question_prompt:        'A potential buyer asks: "What does your company do?" What would you say?',
    response_type:          'short_answer'
  },
  {
    question_id:            'EXD002',
    export_situation:       'Product presentation',
    communicative_function: 'Describing a product',
    question_prompt:        'A buyer asks: "Can you tell me about this product?" What would you say?',
    response_type:          'short_answer'
  },
  {
    question_id:            'EXD003',
    export_situation:       'Product availability',
    communicative_function: 'Confirming availability',
    question_prompt:        'A buyer asks if the product is available for export. What would you say?',
    response_type:          'short_answer'
  },
  {
    question_id:            'EXD004',
    export_situation:       'Buyer question',
    communicative_function: 'Asking for clarification',
    question_prompt:        'A buyer sends a message, but the quantity they need is not clear. What would you ask?',
    response_type:          'short_answer'
  },
  {
    question_id:            'EXD005',
    export_situation:       'Quotation follow-up',
    communicative_function: 'Following up',
    question_prompt:        'You sent a quotation last week and the buyer has not replied. What follow-up message would you send?',
    response_type:          'paragraph'
  },
  {
    question_id:            'EXD006',
    export_situation:       'Delivery time',
    communicative_function: 'Talking about delivery time',
    question_prompt:        'A buyer asks: "How long does delivery take?" What would you say?',
    response_type:          'short_answer'
  },
  {
    question_id:            'EXD007',
    export_situation:       'Payment or order conditions',
    communicative_function: 'Confirming details',
    question_prompt:        'You need to confirm the quantity, price, and delivery address before processing an order. What would you write?',
    response_type:          'paragraph'
  },
  {
    question_id:            'EXD008',
    export_situation:       'Closing the interaction',
    communicative_function: 'Proposing the next step',
    question_prompt:        'You want to invite the buyer to continue the conversation or schedule a call. What would you say?',
    response_type:          'short_answer'
  }
];

/* ── Application state ─────────────────────────── */
let state = {
  participant: null,   // { company_name, participant_name, participant_code, team_area, role, email_optional, test_type }
  currentIndex: 0,
  responses: [],       // array of { question_id, export_situation, communicative_function, question_prompt, student_answer }
  sessionId: null,
  submittedAt: null
};

/* ══════════════════════════════════════════════
   UTILITY HELPERS
══════════════════════════════════════════════ */

/** Generate a simple session ID: timestamp + random suffix */
function generateSessionId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `STEPUP-EXP-${ts}-${rnd}`;
}

/** Show a screen by id, hide the rest */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

/** Format test_type for display */
function formatTestType(raw) {
  return raw === 'pre_test' ? 'Pre-test' : 'Post-test';
}

/* ══════════════════════════════════════════════
   LOCAL STORAGE — PERSISTENCE
══════════════════════════════════════════════ */

function saveToLocalStorage() {
  try {
    localStorage.setItem(LS_SESSION,   JSON.stringify(state.participant));
    localStorage.setItem(LS_RESPONSES, JSON.stringify({
      sessionId:    state.sessionId,
      currentIndex: state.currentIndex,
      responses:    state.responses
    }));
  } catch (_) { /* storage full or private mode */ }
}

function loadFromLocalStorage() {
  try {
    const session   = localStorage.getItem(LS_SESSION);
    const responses = localStorage.getItem(LS_RESPONSES);
    if (session && responses) {
      const p = JSON.parse(session);
      const r = JSON.parse(responses);
      // Validate minimal structure
      if (p && p.participant_name && r && Array.isArray(r.responses)) {
        return { participant: p, ...r };
      }
    }
  } catch (_) { /* corrupted data */ }
  return null;
}

function clearLocalStorage() {
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem(LS_RESPONSES);
}

/* ══════════════════════════════════════════════
   REGISTRATION SCREEN
══════════════════════════════════════════════ */

function initRegistration() {
  // Restore saved session if available
  const saved = loadFromLocalStorage();
  if (saved) {
    const resume = confirm(
      `Continuing session for "${saved.participant.participant_name}".\n\nDo you want to resume where you left off?\n\nPress OK to resume · Cancel to start a new test.`
    );
    if (resume) {
      state.participant    = saved.participant;
      state.sessionId      = saved.sessionId;
      state.currentIndex   = saved.currentIndex;
      state.responses      = saved.responses;
      launchTest();
      return;
    }
  }

  document.getElementById('btn-start').addEventListener('click', handleStart);
}

function handleStart() {
  clearError('reg-error');

  const participant = {
    company_name:     trim('company_name'),
    participant_name: trim('participant_name'),
    participant_code: trim('participant_code'),
    team_area:        trim('team_area'),
    role:             trim('role'),
    email_optional:   trim('email_optional'),
    test_type:        document.querySelector('input[name="test_type"]:checked')?.value || 'pre_test'
  };

  // Validation — only required fields
  const required = ['company_name', 'participant_name', 'participant_code', 'team_area', 'role'];
  const missing  = required.filter(k => !participant[k]);

  if (missing.length) {
    showError('reg-error', 'Please complete all required fields before starting.');
    return;
  }

  // Email format validation (if provided)
  if (participant.email_optional && !isValidEmail(participant.email_optional)) {
    showError('reg-error', 'Please enter a valid email address, or leave it blank.');
    return;
  }

  state.participant  = participant;
  state.sessionId    = generateSessionId();
  state.currentIndex = 0;
  state.responses    = initResponses();

  saveToLocalStorage();
  launchTest();
}

/** Build initial responses array with empty answers */
function initResponses() {
  return DIAGNOSTIC_ITEMS_EXPORT.map(item => ({
    question_id:            item.question_id,
    export_situation:       item.export_situation,
    communicative_function: item.communicative_function,
    question_prompt:        item.question_prompt,
    student_answer:         ''
  }));
}

function trim(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ══════════════════════════════════════════════
   TEST SCREEN
══════════════════════════════════════════════ */

function launchTest() {
  // Populate header
  document.getElementById('header-participant').textContent = state.participant.participant_name;
  document.getElementById('header-type').textContent       = formatTestType(state.participant.test_type);

  showScreen('screen-test');
  renderQuestion();
  buildNavDots();

  document.getElementById('btn-prev').addEventListener('click', handlePrev);
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-restart-test').addEventListener('click', handleRestart);
}

/** Render the current question */
function renderQuestion() {
  const idx  = state.currentIndex;
  const item = DIAGNOSTIC_ITEMS_EXPORT[idx];
  const total = DIAGNOSTIC_ITEMS_EXPORT.length;

  // Progress bar
  const pct = ((idx + 1) / total) * 100;
  document.getElementById('progress-bar').style.width  = pct + '%';
  document.getElementById('progress-label').textContent = `${idx + 1} of ${total}`;

  // Badges
  document.getElementById('q-situation').textContent = item.export_situation;
  document.getElementById('q-function').textContent  = item.communicative_function;

  // Number + prompt
  document.getElementById('q-number').textContent  = `Question ${idx + 1} of ${total}`;
  document.getElementById('q-prompt').textContent  = item.question_prompt;

  // Textarea
  const textarea = document.getElementById('answer-input');
  textarea.value = state.responses[idx]?.student_answer || '';
  textarea.setAttribute('rows', item.response_type === 'paragraph' ? '7' : '5');
  textarea.setAttribute('placeholder',
    item.response_type === 'paragraph'
      ? 'Write your response here (a few sentences are fine)...'
      : 'Write your response here...'
  );
  textarea.focus();

  // Clear error
  clearError('answer-error');

  // Navigation buttons
  document.getElementById('btn-prev').disabled = (idx === 0);

  const isLast = (idx === total - 1);
  const btnNext = document.getElementById('btn-next');
  btnNext.innerHTML = isLast
    ? 'Review &amp; Submit <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'
    : 'Next <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';

  // Re-animate card
  const card = document.getElementById('question-card');
  card.style.animation = 'none';
  card.offsetHeight; // reflow
  card.style.animation = 'slide-in 0.30s cubic-bezier(0.4, 0, 0.2, 1)';

  updateNavDots();
}

function handlePrev() {
  saveCurrentAnswer();
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderQuestion();
  }
}

function handleNext() {
  const answer = document.getElementById('answer-input').value.trim();

  if (!answer) {
    showError('answer-error', 'Please write a response before continuing.');
    document.getElementById('answer-input').focus();
    return;
  }

  saveCurrentAnswer();

  const isLast = (state.currentIndex === DIAGNOSTIC_ITEMS_EXPORT.length - 1);

  if (isLast) {
    state.submittedAt = new Date().toISOString();
    saveToLocalStorage();
    buildSummaryScreen();
    showScreen('screen-summary');
  } else {
    state.currentIndex++;
    renderQuestion();
    saveToLocalStorage();
  }
}

/** Save textarea value into state.responses */
function saveCurrentAnswer() {
  const answer = document.getElementById('answer-input').value.trim();
  if (state.responses[state.currentIndex]) {
    state.responses[state.currentIndex].student_answer = answer;
  }
}

/* ── Nav dots ────────────────────────────────── */
function buildNavDots() {
  const container = document.getElementById('nav-dots');
  container.innerHTML = '';
  DIAGNOSTIC_ITEMS_EXPORT.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'nav-dot';
    dot.id = `dot-${i}`;
    container.appendChild(dot);
  });
}

function updateNavDots() {
  DIAGNOSTIC_ITEMS_EXPORT.forEach((_, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) return;
    dot.className = 'nav-dot';
    if (i === state.currentIndex) {
      dot.classList.add('nav-dot--current');
    } else if (state.responses[i]?.student_answer) {
      dot.classList.add('nav-dot--answered');
    }
  });
}

/* ══════════════════════════════════════════════
   SUMMARY SCREEN
══════════════════════════════════════════════ */

function buildSummaryScreen() {
  const answered = state.responses.filter(r => r.student_answer).length;

  document.getElementById('sum-name').textContent    = state.participant.participant_name;
  document.getElementById('sum-company').textContent = state.participant.company_name;
  document.getElementById('sum-type').textContent    = formatTestType(state.participant.test_type);
  document.getElementById('sum-count').textContent   = `${answered} / ${DIAGNOSTIC_ITEMS_EXPORT.length}`;

  // Reset submit status
  hideSubmitStatus();

  // Wire buttons
  document.getElementById('btn-submit').addEventListener('click', handleSubmitToSheets);
  document.getElementById('btn-download-json').addEventListener('click', handleDownloadJSON);
  document.getElementById('btn-download-txt').addEventListener('click', handleDownloadTXT);
  document.getElementById('btn-copy-json').addEventListener('click', handleCopyJSON);
  document.getElementById('btn-restart-summary').addEventListener('click', handleRestart);
}

/* ══════════════════════════════════════════════
   BUILD FINAL JSON PAYLOAD
══════════════════════════════════════════════ */

function buildPayload() {
  return {
    diagnostic_session_id: state.sessionId,
    test_type:             state.participant.test_type,
    submitted_at:          state.submittedAt || new Date().toISOString(),
    participant: {
      company_name:     state.participant.company_name,
      participant_name: state.participant.participant_name,
      participant_code: state.participant.participant_code,
      team_area:        state.participant.team_area,
      role:             state.participant.role,
      email_optional:   state.participant.email_optional || ''
    },
    responses: state.responses.map(r => ({
      question_id:            r.question_id,
      export_situation:       r.export_situation,
      communicative_function: r.communicative_function,
      question_prompt:        r.question_prompt,
      student_answer:         r.student_answer || ''
    }))
  };
}

/* ══════════════════════════════════════════════
   SUBMIT TO GOOGLE SHEETS
══════════════════════════════════════════════ */

async function handleSubmitToSheets() {
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.classList.add('btn--loading');

  showSubmitStatus('loading', '⏳ Submitting your responses...');

  const payload = buildPayload();

  try {
    const response = await fetch(GOOGLE_SCRIPT_POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script needs text/plain to avoid CORS preflight
      body: JSON.stringify(payload)
    });

    if (response.ok || response.type === 'opaque') {
      // Apps Script with no-cors returns opaque; treat as success
      showSubmitStatus('success', '✓ Submitted successfully. Your responses have been recorded.');
      clearLocalStorage();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    showSubmitStatus(
      'error',
      '⚠ Submission failed. Please download the JSON as a backup and send it to your program coordinator.'
    );
    btn.disabled = false;
    btn.classList.remove('btn--loading');
  }
}

/* ══════════════════════════════════════════════
   DOWNLOAD / COPY HELPERS
══════════════════════════════════════════════ */

function handleDownloadJSON() {
  const payload  = buildPayload();
  const json     = JSON.stringify(payload, null, 2);
  const filename = `StepUp_Export_${state.participant.participant_code}_${state.participant.test_type}_${dateStamp()}.json`;
  downloadFile(json, filename, 'application/json');
}

function handleDownloadTXT() {
  const payload = buildPayload();
  const lines   = [
    '═══════════════════════════════════════════════',
    '  STEP UP EXPORT ENGLISH DIAGNOSTIC — SUMMARY',
    '═══════════════════════════════════════════════',
    '',
    `Session ID:   ${payload.diagnostic_session_id}`,
    `Test type:    ${formatTestType(payload.test_type)}`,
    `Submitted at: ${payload.submitted_at}`,
    '',
    '── PARTICIPANT ─────────────────────────────────',
    `Name:         ${payload.participant.participant_name}`,
    `Company:      ${payload.participant.company_name}`,
    `Code:         ${payload.participant.participant_code}`,
    `Area:         ${payload.participant.team_area}`,
    `Role:         ${payload.participant.role}`,
    `Email:        ${payload.participant.email_optional || '(not provided)'}`,
    '',
    '── RESPONSES ───────────────────────────────────',
    ''
  ];

  payload.responses.forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.question_id} — ${r.communicative_function}`);
    lines.push(`    Situation: ${r.export_situation}`);
    lines.push(`    Prompt:    ${r.question_prompt}`);
    lines.push(`    Answer:    ${r.student_answer || '(no response)'}`);
    lines.push('');
  });

  lines.push('═══════════════════════════════════════════════');
  lines.push('  Step Up Business Solutions · stepuplanguages.com');
  lines.push('═══════════════════════════════════════════════');

  const filename = `StepUp_Export_${state.participant.participant_code}_${state.participant.test_type}_${dateStamp()}.txt`;
  downloadFile(lines.join('\n'), filename, 'text/plain');
}

async function handleCopyJSON() {
  const payload = buildPayload();
  const json    = JSON.stringify(payload, null, 2);
  const btn     = document.getElementById('btn-copy-json');

  try {
    await navigator.clipboard.writeText(json);
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 2200);
  } catch (_) {
    // Fallback for older browsers / file:// protocol
    const ta = document.createElement('textarea');
    ta.value = json;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 2200);
  }
}

/** Create a download trigger for given content */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Return YYYYMMDD string for filenames */
function dateStamp() {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/* ══════════════════════════════════════════════
   RESTART
══════════════════════════════════════════════ */

function handleRestart() {
  const confirmed = confirm(
    'Are you sure you want to restart the test?\n\nAll current answers will be cleared.'
  );
  if (!confirmed) return;

  clearLocalStorage();

  // Reset state
  state = {
    participant:  null,
    currentIndex: 0,
    responses:    [],
    sessionId:    null,
    submittedAt:  null
  };

  // Remove duplicate listeners by replacing buttons with clones
  replaceButton('btn-start', handleStart);
  replaceButton('btn-submit', handleSubmitToSheets);
  replaceButton('btn-download-json', handleDownloadJSON);
  replaceButton('btn-download-txt', handleDownloadTXT);
  replaceButton('btn-copy-json', handleCopyJSON);
  replaceButton('btn-restart-summary', handleRestart);

  // Clear registration fields
  ['company_name', 'participant_name', 'participant_code', 'role', 'email_optional'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const teamArea = document.getElementById('team_area');
  if (teamArea) teamArea.selectedIndex = 0;

  // Reset test type to pre_test
  const preRadio = document.querySelector('input[name="test_type"][value="pre_test"]');
  if (preRadio) preRadio.checked = true;

  clearError('reg-error');
  showScreen('screen-registration');
  initRegistration();
}

/** Clone a button to remove all event listeners, then add one fresh listener */
function replaceButton(id, handler) {
  const old = document.getElementById(id);
  if (!old) return;
  const clone = old.cloneNode(true);
  old.parentNode.replaceChild(clone, old);
  clone.addEventListener('click', handler);
}

/* ══════════════════════════════════════════════
   UI HELPERS — ERRORS & STATUS
══════════════════════════════════════════════ */

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

function clearError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

function showSubmitStatus(type, message) {
  const el = document.getElementById('submit-status');
  el.className = `submit-status submit-status--${type}`;
  el.textContent = message;
  el.style.display = 'block';
}

function hideSubmitStatus() {
  const el = document.getElementById('submit-status');
  el.style.display = 'none';
  el.className = 'submit-status';
  el.textContent = '';
}

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-start').addEventListener('click', handleStart);
  initRegistration();
});
