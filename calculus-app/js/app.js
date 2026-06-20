/* ============================================================
   CALCULUS LEARNING PLATFORM — CORE ENGINE
   Chunk 1: App state, chapter loading, navigation, rendering
   ============================================================ */

'use strict';

// ── App State ────────────────────────────────────────────────
const AppState = {
  currentChapter: null,
  currentSection: null,
  bookmarks: [],
  progress: {},   // { chId: { completed: bool, quizScore: number } }
  darkMode: false,
  chapters: {},   // loaded chapter JSON keyed by id
  quizState: {},  // per-section quiz state
  notes: {},      // per-section personal notes
};

// ── Chapter Registry ─────────────────────────────────────────
const CHAPTER_META = [
  { id: 'ch1', title: 'Introduction to Calculus', subtitle: 'The Study of Change',           file: 'data/chapter1.json' },
  { id: 'ch2', title: 'Derivatives',               subtitle: 'Measuring Instantaneous Change', file: 'data/chapter2.json' },
  { id: 'ch3', title: 'Applications of Derivatives', subtitle: 'Optimization & Curve Analysis', file: 'data/chapter3.json' },
  { id: 'ch4', title: 'Integrals',                 subtitle: 'The Study of Accumulation',      file: 'data/chapter4.json' },
  { id: 'ch5', title: 'Applications of Integrals', subtitle: 'Area, Volume, and More',        file: 'data/chapter5.json' },
  { id: 'ch6', title: 'Techniques of Integration', subtitle: 'Advanced Methods',              file: 'data/chapter6.json' },
  { id: 'ch7', title: 'Differential Equations',   subtitle: 'Modeling with Rates of Change',  file: 'data/chapter7.json' },
];

// ── Persistence Layer ────────────────────────────────────────
const Storage = {
  save(key, value) {
    try { localStorage.setItem('calcapp_' + key, JSON.stringify(value)); } catch(e) {}
  },
  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem('calcapp_' + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch(e) { return fallback; }
  }
};

// ── DOM Helpers ───────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

// ── Initialize App ───────────────────────────────────────────
async function initApp() {
  loadPersistedState();
  buildSidebar();
  bindTopbar();
  bindKeyboardShortcuts();
  observeScroll();

  // Load first chapter with content
  await navigateToChapter('ch1');
}

function loadPersistedState() {
  AppState.darkMode    = Storage.load('darkMode', false);
  AppState.bookmarks   = Storage.load('bookmarks', []);
  AppState.progress    = Storage.load('progress', {});
  AppState.notes       = Storage.load('notes', {});
  AppState.quizState   = Storage.load('quizState', {});

  if (AppState.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = $('#btn-theme');
    if (btn) btn.textContent = '☀️';
  }

  // Restore done badges after sidebar is built
  setTimeout(() => {
    Object.entries(AppState.progress).forEach(([chId, p]) => {
      if (p.completed) markChapterDone(chId);
    });
  }, 50);

  updateProgressPill();
}

// ── Sidebar Builder ───────────────────────────────────────────
function buildSidebar() {
  const list = $('#chapter-list');
  list.innerHTML = '';

  CHAPTER_META.forEach((meta, idx) => {
    const isPlaceholder = idx > 0; // ch2+ are placeholders initially
    const isDone = AppState.progress[meta.id]?.completed;

    const item = el('div', 'chapter-item');

    const btn = el('button', `chapter-btn${isDone ? ' done' : ''}`);
    btn.innerHTML = `
      <span class="ch-num">${idx + 1}</span>
      <span class="ch-title">${meta.title}</span>
      ${isPlaceholder ? '<span class="ch-placeholder-tag"></span>' : ''}
      <span class="ch-arrow">▶</span>
    `;
    btn.dataset.chId = meta.id;
    btn.addEventListener('click', () => onChapterClick(meta.id, btn, sectionList));

    const sectionList = el('div', 'section-list');
    sectionList.id = `sec-list-${meta.id}`;

    item.append(btn, sectionList);
    list.appendChild(item);
  });
}

function onChapterClick(chId, btn, sectionList) {
  const isOpen = btn.classList.contains('open');

  // Close all
  $$('.chapter-btn.open').forEach(b => {
    b.classList.remove('open');
    const sl = document.getElementById(`sec-list-${b.dataset.chId}`);
    if (sl) sl.classList.remove('open');
  });

  if (!isOpen) {
    btn.classList.add('open');
    sectionList.classList.add('open');
    navigateToChapter(chId);
  }
}

function updateSidebarSections(chId, sections) {
  const sectionList = $(`#sec-list-${chId}`);
  if (!sectionList) return;
  sectionList.innerHTML = '';

  sections.forEach(sec => {
    const btn = el('button', 'section-btn');
    btn.innerHTML = `<span class="sec-dot"></span>${sec.title}`;
    btn.dataset.secId = sec.id;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollToSection(sec.id);
    });
    sectionList.appendChild(btn);
  });
}

function setActiveSidebarChapter(chId) {
  $$('.chapter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.chId === chId);
  });
  const btn = $(`.chapter-btn[data-ch-id="${chId}"]`);
  if (btn && !btn.classList.contains('open')) {
    btn.classList.add('open');
    const sl = $(`#sec-list-${chId}`);
    if (sl) sl.classList.add('open');
  }
}

function setActiveSidebarSection(secId) {
  $$('.section-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.secId === secId);
  });
}

// ── Chapter Navigation ────────────────────────────────────────
async function navigateToChapter(chId) {
  if (AppState.currentChapter === chId && AppState.chapters[chId]) {
    return; // Already loaded
  }

  const meta = CHAPTER_META.find(m => m.id === chId);
  if (!meta) return;

  // Load JSON if not cached
  if (!AppState.chapters[chId]) {
    try {
      const resp = await fetch(meta.file);
      AppState.chapters[chId] = await resp.json();
    } catch(e) {
      console.error('Failed to load chapter:', chId, e);
      renderError(chId, meta);
      return;
    }
  }

  AppState.currentChapter = chId;
  const chapter = AppState.chapters[chId];

  renderChapter(chapter, meta);
  setActiveSidebarChapter(chId);

  // Build sidebar sections
  if (chapter.sections && chapter.sections.length > 0) {
    updateSidebarSections(chId, chapter.sections);
  }
}

// ── Chapter Renderer ──────────────────────────────────────────
function renderChapter(chapter, meta) {
  const main = $('#main-content');
  main.innerHTML = '';

  // Hero
  const hero = el('div', 'chapter-hero');
  hero.innerHTML = `
    <div class="ch-badge">📐 Chapter ${meta.id.replace('ch','')}</div>
    <h1>${chapter.title}</h1>
    <div class="subtitle">${chapter.subtitle}</div>
  `;
  // Bookmark button on hero
  const bmBtn = el('button', 'icon-btn', '🔖');
  bmBtn.style.cssText = 'position:absolute;top:20px;right:20px;';
  bmBtn.title = 'Bookmark this chapter';
  bmBtn.addEventListener('click', () => toggleBookmark(chapter.id, chapter.title, 'chapter'));
  hero.appendChild(bmBtn);
  main.appendChild(hero);

  if (chapter._placeholder || !chapter.sections || chapter.sections.length === 0) {
    renderPlaceholder(main, chapter);
    return;
  }

  // Render each section
  chapter.sections.forEach(sec => renderSection(main, sec, chapter));
}

function renderPlaceholder(main, chapter) {
  const ph = el('div', 'chapter-placeholder');
  ph.innerHTML = `
    <div class="placeholder-icon">🚧</div>
    <h2>${chapter.title}</h2>
    <p>Content for this chapter is coming . Provide the chapter JSON to unlock all interactive features.</p>
  `;
  main.appendChild(ph);
}

function renderError(chId, meta) {
  const main = $('#main-content');
  main.innerHTML = `
    <div class="chapter-placeholder">
      <div class="placeholder-icon">⚠️</div>
      <h2>${meta.title}</h2>
      <p>Failed to load chapter data. Please check that <code>${meta.file}</code> exists.</p>
    </div>
  `;
}

// ── Section Renderer ──────────────────────────────────────────
function renderSection(container, sec, chapter) {
  const wrapper = el('div', 'content-section');
  wrapper.id = sec.id;

  const SUBSEC_RENDERERS = {
    intuition:    renderIntuitionSubsec,
    concepts:     renderConceptsSubsec,
    examples:     renderExamplesSubsec,
    visual:       renderVisualSubsec,
    code:         renderCodeSubsec,
    quiz:         renderQuizSubsec,
    practice:     renderPracticeSubsec,
    mistakes:     renderMistakesSubsec,
    advanced:     renderAdvancedSubsec,
    applications: renderApplicationsSubsec,
  };

  if (sec.subsections) {
    // Build tab nav for subsections
    const tabNav = buildSubsectionTabs(sec.subsections);
    wrapper.appendChild(tabNav);

    sec.subsections.forEach((sub, i) => {
      const panel = el('div', `subsec-panel${i === 0 ? ' active' : ''}`);
      panel.id = `panel-${sub.id}`;
      panel.dataset.subsecId = sub.id;

      const renderer = SUBSEC_RENDERERS[sub.type];
      if (renderer) renderer(panel, sub, chapter);
      else panel.innerHTML = `<p style="color:var(--text-tertiary);padding:20px">Unknown section type: ${sub.type}</p>`;

      wrapper.appendChild(panel);
    });
  }

  container.appendChild(wrapper);

  // Animate in with delay
  wrapper.style.animationDelay = '0.05s';
}

function buildSubsectionTabs(subsections) {
  const nav = el('div', 'subsec-tab-nav');
  nav.style.cssText = `
    display: flex; gap: 0; border-bottom: 1px solid var(--border);
    background: var(--card); overflow-x: auto; flex-wrap: nowrap;
    margin-bottom: 0;
  `;

  subsections.forEach((sub, i) => {
    const tab = el('button', `subsec-tab${i === 0 ? ' active' : ''}`);
    tab.style.cssText = `
      padding: 9px 16px; font-size: 0.8rem; font-weight: 500;
      color: var(--text-secondary); cursor: pointer;
      border-bottom: 2px solid transparent; white-space: nowrap;
      transition: all 0.2s; background: none;
      border-top: none; border-left: none; border-right: none;
      font-family: var(--font-body);
    `;
    if (i === 0) tab.style.color = 'var(--accent)';
    if (i === 0) tab.style.borderBottomColor = 'var(--accent)';

    const TAG_LABELS = {
      intuition:'💡 Intuition', concepts:'📖 Concepts', examples:'✏️ Examples',
      visual:'📊 Visual', code:'🐍 Python', quiz:'🎯 Quiz',
      practice:'🏋️ Practice', mistakes:'⚠️ Mistakes', advanced:'🔬 Advanced',
      applications:'🌍 Applications'
    };
    tab.textContent = TAG_LABELS[sub.type] || sub.label || sub.type;
    tab.dataset.panelId = `panel-${sub.id}`;

    tab.addEventListener('click', () => {
      const navEl = tab.closest('.content-section');
      navEl.querySelectorAll('.subsec-tab').forEach(t => {
        t.style.color = 'var(--text-secondary)';
        t.style.borderBottomColor = 'transparent';
        t.classList.remove('active');
      });
      navEl.querySelectorAll('.subsec-panel').forEach(p => p.classList.remove('active'));
      tab.style.color = 'var(--accent)';
      tab.style.borderBottomColor = 'var(--accent)';
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.panelId);
      if (panel) {
        panel.classList.add('active');
        // Trigger graph render if needed
        if (panel.dataset.graphPending) {
          const gw = panel.querySelector('[id^="gw-"]');
          if (gw && typeof GraphModule !== 'undefined') {
            GraphModule.build(gw, JSON.parse(panel.dataset.graphConfig || '{}'));
          } else {
            renderGraphForPanel(panel);
          }
          delete panel.dataset.graphPending;
        }
      }
    });

    nav.appendChild(tab);
  });

  return nav;
}

// subsec-panel visibility
const style = document.createElement('style');
style.textContent = `.subsec-panel { display: none; padding: 28px 40px; } .subsec-panel.active { display: block; animation: fadeUp 0.25s ease both; }`;
document.head.appendChild(style);

// ── Subsection Renderers ──────────────────────────────────────

function renderIntuitionSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-intuition">💡 Intuition</span>
      <h2>${sub.heading}</h2>
    </div>
    <div class="prose"><p>${sub.body}</p></div>
  `;
  if (sub.analogy) {
    const kp = (sub.analogy.keyPoints || []).map(kp =>
      `<li>${kp}</li>`
    ).join('');
    const card = el('div', 'analogy-card');
    card.innerHTML = `
      <div class="analogy-title">🚗 ${sub.analogy.title}</div>
      <div class="analogy-body">${sub.analogy.body}</div>
      ${kp ? `<ul class="key-points">${kp}</ul>` : ''}
    `;
    panel.appendChild(card);
  }
}

function renderConceptsSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-concepts">📖 Concepts</span>
      <h2>${sub.heading}</h2>
    </div>
  `;
  const grid = el('div', 'definition-grid');
  (sub.definitions || []).forEach(d => {
    const card = el('div', 'def-card');
    card.innerHTML = `
      <div class="def-term">${d.term}</div>
      <div class="def-body">${d.definition}</div>
    `;
    grid.appendChild(card);
  });
  panel.appendChild(grid);
}

function renderExamplesSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-examples">✏️ Examples</span>
      <h2>${sub.heading}</h2>
    </div>
  `;
  const list = el('div', 'example-list');
  (sub.examples || []).forEach(ex => {
    const lvlClass = { 'Basic':'level-basic','Intermediate':'level-intermediate','Advanced':'level-advanced' }[ex.level] || 'level-basic';
    const steps = ex.steps.map(s => `<li>${s}</li>`).join('');
    const card = el('div', 'example-card');
    card.innerHTML = `
      <div class="example-header">
        <span class="example-level ${lvlClass}">${ex.level}</span>
        <span class="example-title">${ex.title}</span>
      </div>
      <div class="example-problem">${ex.problem}</div>
      <ol class="example-steps">${steps}</ol>
      <div class="example-result">✓ Result: ${ex.result}</div>
    `;
    list.appendChild(card);
  });
  panel.appendChild(list);
}

function renderVisualSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-visual">📊 Visual</span>
      <h2>${sub.heading}</h2>
    </div>
  `;

  if (sub.graph) {
    panel.dataset.graphConfig = JSON.stringify(sub.graph);
    panel.dataset.graphPending = 'true';

    // GraphModule builds the appropriate panel type
    const graphWrapper = el('div');
    graphWrapper.id = `gw-${panel.id}`;
    panel.appendChild(graphWrapper);

    // Defer until panel is visible
    setTimeout(() => {
      if (panel.classList.contains('active')) {
        if (typeof GraphModule !== 'undefined') {
          GraphModule.build(graphWrapper, sub.graph);
        } else {
          renderGraph(panel.id, sub.graph); // fallback to basic
        }
        delete panel.dataset.graphPending;
      }
    }, 100);
  }

  if (sub.visualNotes && sub.visualNotes.length > 0) {
    const notesBox = el('div', 'visual-notes');
    sub.visualNotes.forEach(n => {
      const note = el('div', 'visual-note');
      note.textContent = n;
      notesBox.appendChild(note);
    });
    panel.appendChild(notesBox);
  }
}

window.plotFromPanel = function(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const cfg = JSON.parse(panel.dataset.graphConfig || '{}');
  const exprEl = document.getElementById(`graph-expr-${panelId}`);
  if (exprEl) cfg.defaultExpression = exprEl.value;
  renderGraph(panelId, cfg);
};

window.resetGraph = function(panelId, defaultExpr) {
  const exprEl = document.getElementById(`graph-expr-${panelId}`);
  if (exprEl) exprEl.value = defaultExpr;
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const cfg = JSON.parse(panel.dataset.graphConfig || '{}');
  renderGraph(panelId, cfg);
};

function renderGraph(panelId, cfg) {
  const divId = `plotly-graph-${panelId}`;
  const div = document.getElementById(divId);
  if (!div || typeof Plotly === 'undefined') return;

  const expr = cfg.defaultExpression || 'x^2';
  const xMin = (cfg.xRange || [-5,5])[0];
  const xMax = (cfg.xRange || [-5,5])[1];
  const yMin = (cfg.yRange || [-5,5])[0];
  const yMax = (cfg.yRange || [-5,5])[1];

  const xs = [];
  const ys = [];
  const N = 400;
  const scope = {};

  for (let i = 0; i <= N; i++) {
    const x = xMin + (xMax - xMin) * (i / N);
    xs.push(x);
    try {
      scope.x = x;
      const y = math.evaluate(expr, scope);
      ys.push(isFinite(y) ? y : null);
    } catch(e) {
      ys.push(null);
    }
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#e8e4dd' : '#3d3a35';
  const gridColor = isDark ? '#333028' : '#e0dcd5';
  const bgColor = 'transparent';

  const trace = {
    x: xs, y: ys,
    type: 'scatter', mode: 'lines',
    line: { color: '#8b9dc3', width: 2.5 },
    name: `f(x) = ${expr}`,
    connectgaps: false,
  };

  const layout = {
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    font: { family: 'DM Sans, sans-serif', color: textColor, size: 12 },
    margin: { l: 50, r: 20, t: 20, b: 50 },
    xaxis: {
      range: [xMin, xMax],
      gridcolor: gridColor, gridwidth: 1,
      zerolinecolor: isDark ? '#8a8880' : '#5c5a55', zerolinewidth: 1.5,
      showgrid: true, color: textColor,
    },
    yaxis: {
      range: [yMin, yMax],
      gridcolor: gridColor, gridwidth: 1,
      zerolinecolor: isDark ? '#8a8880' : '#5c5a55', zerolinewidth: 1.5,
      showgrid: true, color: textColor,
    },
    hovermode: 'x unified',
    showlegend: true,
    legend: { x: 0, y: 1, bgcolor: 'rgba(0,0,0,0)', font: { size: 11 } },
  };

  const config = { responsive: true, displayModeBar: false };

  Plotly.newPlot(divId, [trace], layout, config);
}

window.renderGraphForPanel = function(panel) {
  const cfg = JSON.parse(panel.dataset.graphConfig || '{}');
  renderGraph(panel.id, cfg);
};

function renderCodeSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-code">🐍 Python</span>
      <h2>${sub.heading}</h2>
    </div>
  `;

  const snippets = sub.snippets || [];

  // Tab nav
  const tabNav = el('div', 'code-tabs');
  const panelsContainer = el('div');

  snippets.forEach((snip, i) => {
    const tabId = `code-tab-${panel.id}-${i}`;
    const pnlId = `code-pnl-${panel.id}-${i}`;

    const tab = el('button', `code-tab${i === 0 ? ' active' : ''}`);
    tab.textContent = snip.title;
    tab.dataset.pnlId = pnlId;
    tab.dataset.tabId = tabId;
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.code-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(pnlId).classList.add('active');
    });
    tabNav.appendChild(tab);

    const pnl = el('div', `code-panel${i === 0 ? ' active' : ''}`);
    pnl.id = pnlId;

    const wrapper = el('div', 'code-editor-wrapper');
    wrapper.style.marginTop = '16px';
    wrapper.innerHTML = `
      <div class="code-editor-header">
        <span class="code-editor-title">${snip.title}</span>
        <div class="code-editor-actions">
          <button class="btn btn-outline" onclick="copyCode('${pnlId}')">Copy</button>
          <button class="btn btn-primary" onclick="runCode('${pnlId}')">▶ Run</button>
        </div>
      </div>
      <textarea class="code-area" id="code-area-${pnlId}" spellcheck="false">${snip.code}</textarea>
      <div class="code-output" id="code-out-${pnlId}">
        <div class="output-label">Output</div>
        <span style="color:var(--text-tertiary);font-style:italic">Press Run to execute...</span>
      </div>
    `;
    pnl.appendChild(wrapper);
    panelsContainer.appendChild(pnl);
  });

  panel.appendChild(tabNav);
  panel.appendChild(panelsContainer);

  // Note about Python runtime
  const note = el('p');
  note.style.cssText = 'font-size:0.8rem;color:var(--text-tertiary);margin-top:12px;';
  note.textContent = '⚡ Python runs in-browser via Skulpt. SymPy is simulated; numpy and matplotlib are supported.';
  panel.appendChild(note);
}

window.copyCode = function(pnlId) {
  const area = document.getElementById(`code-area-${pnlId}`);
  if (!area) return;
  navigator.clipboard.writeText(area.value).then(() => {
    // brief feedback
    const btn = area.closest('.code-editor-wrapper').querySelector('.btn-outline');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
};

window.runCode = function(pnlId) {
  const area = document.getElementById(`code-area-${pnlId}`);
  const out  = document.getElementById(`code-out-${pnlId}`);
  if (!area || !out) return;

  const code = area.value;
  out.className = 'code-output running';
  out.innerHTML = `<div class="output-label">Output</div><div class="spinner"></div> Running...`;

  PythonRunner.run(code, out);
};

function renderQuizSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-quiz">🎯 Quiz</span>
      <h2>${sub.heading}</h2>
    </div>
  `;

  const questions = sub.questions || [];
  if (questions.length === 0) {
    panel.innerHTML += '<p style="color:var(--text-tertiary)">No questions yet.</p>';
    return;
  }

  const container = el('div', 'quiz-container');
  const stateKey = `${AppState.currentChapter}-${sub.id}`;
  const savedState = AppState.quizState[stateKey];

  // Progress bar
  const progressBar = el('div', 'quiz-progress-bar');
  const progressFill = el('div', 'quiz-progress-fill');
  progressFill.style.width = '0%';
  progressBar.appendChild(progressFill);
  container.appendChild(progressBar);

  // Quiz state
  const qState = {
    current: 0,
    answers: new Array(questions.length).fill(null),
    completed: false,
    score: 0,
  };

  // Render all questions (hidden by default)
  questions.forEach((q, qi) => {
    const qDiv = el('div', `quiz-question${qi === 0 ? ' active' : ''}`);
    qDiv.id = `quiz-q-${stateKey}-${qi}`;

    const optLetters = ['A','B','C','D'];
    const optsHtml = q.options.map((opt, oi) => `
      <button class="quiz-option" onclick="quizAnswer('${stateKey}', ${qi}, ${oi})">
        <span class="opt-letter">${optLetters[oi]}</span>
        <span>${opt}</span>
      </button>
    `).join('');

    qDiv.innerHTML = `
      <div class="quiz-q-num">Question ${qi + 1} of ${questions.length}</div>
      <div class="quiz-q-text">${q.text}</div>
      <div class="quiz-options">${optsHtml}</div>
      <div class="quiz-explanation" id="quiz-exp-${stateKey}-${qi}">
        <div class="exp-label">💬 Explanation</div>
        ${q.explanation}
      </div>
    `;
    container.appendChild(qDiv);
  });

  // Score display
  const scoreDisplay = el('div', 'quiz-score-display');
  scoreDisplay.id = `quiz-score-${stateKey}`;
  scoreDisplay.innerHTML = `
    <div class="score-ring" id="score-ring-${stateKey}">
      <span id="score-text-${stateKey}">0%</span>
    </div>
    <h3 style="font-family:var(--font-display);margin-bottom:8px;color:var(--text)">Quiz Complete!</h3>
    <p style="color:var(--text-secondary);margin-bottom:16px" id="score-msg-${stateKey}"></p>
    <button class="btn btn-primary" onclick="resetQuiz('${stateKey}', ${questions.length})">Retry Quiz</button>
  `;
  container.appendChild(scoreDisplay);

  // Navigation
  const nav = el('div', 'quiz-nav');
  nav.innerHTML = `
    <button class="btn btn-outline" id="quiz-prev-${stateKey}" onclick="quizNav('${stateKey}', -1, ${questions.length})" disabled>← Previous</button>
    <span id="quiz-indicator-${stateKey}" style="font-size:0.8rem;color:var(--text-tertiary)">1 / ${questions.length}</span>
    <button class="btn btn-outline" id="quiz-next-${stateKey}" onclick="quizNav('${stateKey}', 1, ${questions.length})">Next →</button>
  `;
  container.appendChild(nav);

  panel.appendChild(container);

  // Store state reference on panel
  panel._quizState = qState;
  panel._quizMeta = { stateKey, questions };
  window[`_quiz_${stateKey}`] = { qState, questions };
}

window.quizAnswer = function(stateKey, qi, oi) {
  const quiz = window[`_quiz_${stateKey}`];
  if (!quiz || quiz.qState.answers[qi] !== null) return;

  quiz.qState.answers[qi] = oi;
  const q = quiz.questions[qi];
  const isCorrect = oi === q.correct;
  if (isCorrect) quiz.qState.score++;

  // Style options
  const qDiv = document.getElementById(`quiz-q-${stateKey}-${qi}`);
  if (!qDiv) return;
  const opts = qDiv.querySelectorAll('.quiz-option');
  opts.forEach((opt, i) => {
    opt.classList.add('disabled');
    if (i === q.correct) opt.classList.add('correct');
    else if (i === oi && !isCorrect) opt.classList.add('incorrect');
  });

  // Show explanation
  const exp = document.getElementById(`quiz-exp-${stateKey}-${qi}`);
  if (exp) exp.classList.add('show');

  // Update progress
  const answered = quiz.qState.answers.filter(a => a !== null).length;
  const pct = (answered / quiz.questions.length) * 100;
  const fill = document.querySelector(`#quiz-score-${stateKey}`)?.closest('.quiz-container')?.querySelector('.quiz-progress-fill');
  if (fill) fill.style.width = `${pct}%`;

  // Check completion
  if (answered === quiz.questions.length) {
    setTimeout(() => showQuizScore(stateKey, quiz), 800);
  }
};

function showQuizScore(stateKey, quiz) {
  // Hide all question divs
  quiz.questions.forEach((_, qi) => {
    const qDiv = document.getElementById(`quiz-q-${stateKey}-${qi}`);
    if (qDiv) qDiv.classList.remove('active');
  });
  const navEl = document.getElementById(`quiz-prev-${stateKey}`)?.parentElement;
  if (navEl) navEl.style.display = 'none';

  const scoreDisplay = document.getElementById(`quiz-score-${stateKey}`);
  if (!scoreDisplay) return;
  scoreDisplay.classList.add('show');

  const pct = Math.round((quiz.qState.score / quiz.questions.length) * 100);
  const ring = document.getElementById(`score-ring-${stateKey}`);
  const textEl = document.getElementById(`score-text-${stateKey}`);
  const msgEl = document.getElementById(`score-msg-${stateKey}`);

  if (ring) ring.style.background = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--border) 0deg)`;
  if (textEl) textEl.textContent = `${pct}%`;
  if (msgEl) {
    const msgs = [
      [90, '🌟 Excellent! You\'ve mastered this section.'],
      [70, '👍 Good work! Review the explanations above.'],
      [50, '📚 Keep studying — you\'re getting there!'],
      [0,  '💪 Don\'t worry, review and try again!'],
    ];
    msgEl.textContent = (msgs.find(([t]) => pct >= t) || msgs[3])[1];
  }

  // Save progress
  if (!AppState.progress[AppState.currentChapter]) AppState.progress[AppState.currentChapter] = {};
  AppState.progress[AppState.currentChapter].quizScore = pct;
  if (pct >= 60) {
    AppState.progress[AppState.currentChapter].completed = true;
    markChapterDone(AppState.currentChapter);
    showCompletionBanner(AppState.currentChapter, pct);
  }
  Storage.save('progress', AppState.progress);
  updateProgressPill();
};

window.resetQuiz = function(stateKey, qLen) {
  const quiz = window[`_quiz_${stateKey}`];
  if (!quiz) return;
  quiz.qState.answers = new Array(qLen).fill(null);
  quiz.qState.score = 0;
  quiz.qState.current = 0;

  const scoreDisplay = document.getElementById(`quiz-score-${stateKey}`);
  if (scoreDisplay) scoreDisplay.classList.remove('show');

  const navEl = document.getElementById(`quiz-prev-${stateKey}`)?.parentElement;
  if (navEl) navEl.style.display = '';

  quiz.questions.forEach((_, qi) => {
    const qDiv = document.getElementById(`quiz-q-${stateKey}-${qi}`);
    if (!qDiv) return;
    qDiv.classList.toggle('active', qi === 0);
    qDiv.querySelectorAll('.quiz-option').forEach(o => {
      o.classList.remove('correct','incorrect','disabled');
    });
    const exp = document.getElementById(`quiz-exp-${stateKey}-${qi}`);
    if (exp) exp.classList.remove('show');
  });

  const fill = scoreDisplay?.closest('.quiz-container')?.querySelector('.quiz-progress-fill');
  if (fill) fill.style.width = '0%';
  const indicator = document.getElementById(`quiz-indicator-${stateKey}`);
  if (indicator) indicator.textContent = `1 / ${qLen}`;
  updateQuizNav(stateKey, 0, qLen);
};

window.quizNav = function(stateKey, dir, qLen) {
  const quiz = window[`_quiz_${stateKey}`];
  if (!quiz) return;
  const prev = quiz.qState.current;
  const next = Math.max(0, Math.min(qLen - 1, prev + dir));
  if (prev === next) return;
  quiz.qState.current = next;

  document.getElementById(`quiz-q-${stateKey}-${prev}`)?.classList.remove('active');
  document.getElementById(`quiz-q-${stateKey}-${next}`)?.classList.add('active');

  const indicator = document.getElementById(`quiz-indicator-${stateKey}`);
  if (indicator) indicator.textContent = `${next + 1} / ${qLen}`;

  updateQuizNav(stateKey, next, qLen);
};

function updateQuizNav(stateKey, current, qLen) {
  const prev = document.getElementById(`quiz-prev-${stateKey}`);
  const next = document.getElementById(`quiz-next-${stateKey}`);
  if (prev) prev.disabled = current === 0;
  if (next) next.disabled = current === qLen - 1;
}

function renderPracticeSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-practice">🏋️ Practice</span>
      <h2>${sub.heading}</h2>
    </div>
  `;
  const list = el('div', 'practice-list');

  (sub.problems || []).forEach((p, i) => {
    const lvlClass = { 'Easy':'level-basic','Medium':'level-intermediate','Hard':'level-advanced','Real-World':'level-intermediate' }[p.level] || 'level-basic';
    const card = el('div', 'practice-card');
    card.innerHTML = `
      <div class="practice-header">
        <span class="practice-level ${lvlClass}">${p.level}</span>
        <span class="practice-label">${p.label}</span>
      </div>
      <div class="practice-body">${p.problem}</div>
      <div class="practice-actions">
        <button class="btn btn-outline" onclick="toggleHint('ph-${panel.id}-${i}')">💡 Hint</button>
        <button class="btn btn-outline" onclick="toggleSolution('ps-${panel.id}-${i}')">✓ Solution</button>
      </div>
      <div class="practice-hint" id="ph-${panel.id}-${i}">
        <div class="hint-label">💡 Hint</div>${p.hint}
      </div>
      <div class="practice-solution" id="ps-${panel.id}-${i}">
        <div class="solution-label">✓ Solution</div>${p.solution}
      </div>
    `;
    list.appendChild(card);
  });
  panel.appendChild(list);
}

window.toggleHint = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('show');
};
window.toggleSolution = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('show');
};

function renderMistakesSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-mistakes">⚠️ Mistakes</span>
      <h2>${sub.heading}</h2>
    </div>
  `;
  const list = el('div', 'mistakes-list');
  (sub.mistakes || []).forEach(m => {
    const card = el('div', 'mistake-card');
    card.innerHTML = `
      <div class="mistake-icon">⚠️</div>
      <div class="mistake-content">
        <div class="mistake-title">${m.title}</div>
        <div class="mistake-desc">${m.description}</div>
      </div>
    `;
    list.appendChild(card);
  });
  panel.appendChild(list);
}

function renderAdvancedSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-advanced">🔬 Advanced</span>
      <h2>${sub.heading}</h2>
    </div>
  `;
  const list = el('div', 'insights-list');
  (sub.insights || []).forEach(ins => {
    const card = el('div', 'insight-card');
    card.innerHTML = `
      <div class="insight-title">${ins.title}</div>
      <div class="insight-body">${ins.body}</div>
    `;
    list.appendChild(card);
  });
  panel.appendChild(list);
}

function renderApplicationsSubsec(panel, sub) {
  panel.innerHTML = `
    <div class="section-heading">
      <span class="section-tag tag-applications">🌍 Applications</span>
      <h2>${sub.heading}</h2>
    </div>
  `;
  const grid = el('div', 'applications-grid');
  (sub.applications || []).forEach(app => {
    const card = el('div', 'app-card');
    card.innerHTML = `
      <div class="app-field">${app.field}</div>
      <div class="app-desc">${app.description}</div>
    `;
    grid.appendChild(card);
  });
  panel.appendChild(grid);
}

// ── Topbar Bindings ───────────────────────────────────────────
function bindTopbar() {
  // Dark mode
  $('#btn-theme')?.addEventListener('click', () => {
    AppState.darkMode = !AppState.darkMode;
    document.documentElement.setAttribute('data-theme', AppState.darkMode ? 'dark' : '');
    $('#btn-theme').textContent = AppState.darkMode ? '☀️' : '🌙';
    Storage.save('darkMode', AppState.darkMode);
    // Re-render active graphs with new colors
    document.querySelectorAll('.subsec-panel.active').forEach(p => {
      if (p.dataset.graphConfig && !p.dataset.graphPending) {
        renderGraph(p.id, JSON.parse(p.dataset.graphConfig));
      }
    });
  });

  // Bookmarks
  $('#btn-bookmarks')?.addEventListener('click', () => {
    $('#bookmarks-panel').classList.toggle('open');
    renderBookmarksPanel();
  });

  // Sidebar toggle (mobile)
  $('#btn-sidebar')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  // Search
  const searchInput = $('#search-input');
  const searchResults = $('#search-results');
  let searchTimeout;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doSearch(e.target.value, searchResults), 200);
  });
  searchInput?.addEventListener('focus', () => {
    if (searchInput.value) doSearch(searchInput.value, searchResults);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-wrapper')) {
      searchResults.classList.remove('open');
    }
  });
}

function doSearch(query, resultsEl) {
  if (!query.trim()) { resultsEl.classList.remove('open'); return; }
  const q = query.toLowerCase();
  const results = [];

  CHAPTER_META.forEach((meta) => {
    const ch = AppState.chapters[meta.id];
    if (!ch || !ch.sections) return;
    ch.sections.forEach(sec => {
      if (!sec.subsections) return;
      sec.subsections.forEach(sub => {
        const searchable = [sub.heading, sub.label, sub.body || ''].join(' ').toLowerCase();
        if (searchable.includes(q)) {
          results.push({ title: sub.heading, chapter: meta.title, secId: sec.id, chId: meta.id });
        }
        // Search definitions
        (sub.definitions || []).forEach(d => {
          if ((d.term + ' ' + d.definition).toLowerCase().includes(q)) {
            results.push({ title: d.term, chapter: meta.title, secId: sec.id, chId: meta.id });
          }
        });
      });
    });
  });

  resultsEl.innerHTML = '';
  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-result-item" style="color:var(--text-tertiary)">No results found</div>';
  } else {
    results.slice(0, 8).forEach(r => {
      const item = el('div', 'search-result-item');
      item.innerHTML = `<div class="sr-title">${r.title}</div><div class="sr-chapter">${r.chapter}</div>`;
      item.addEventListener('click', () => {
        navigateToChapter(r.chId).then(() => scrollToSection(r.secId));
        resultsEl.classList.remove('open');
        $('#search-input').value = '';
      });
      resultsEl.appendChild(item);
    });
  }
  resultsEl.classList.add('open');
}

// ── Bookmarks ─────────────────────────────────────────────────
function toggleBookmark(id, title, type) {
  const existing = AppState.bookmarks.findIndex(b => b.id === id);
  if (existing >= 0) {
    AppState.bookmarks.splice(existing, 1);
  } else {
    AppState.bookmarks.push({ id, title, type, ts: Date.now() });
  }
  Storage.save('bookmarks', AppState.bookmarks);
  renderBookmarksPanel();
}

function renderBookmarksPanel() {
  const panel = $('#bookmarks-panel');
  const content = panel.querySelector('.bookmarks-content') || el('div', 'bookmarks-content');
  content.innerHTML = '';

  if (AppState.bookmarks.length === 0) {
    content.innerHTML = '<div class="bookmarks-empty">No bookmarks yet.<br>Click 🔖 on any chapter to save it.</div>';
  } else {
    AppState.bookmarks.forEach(bm => {
      const item = el('div', 'bookmark-item');
      item.innerHTML = `
        <span class="bm-icon">🔖</span>
        <div>
          <div class="bm-text">${bm.title}</div>
          <div class="bm-sub">${bm.type}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        if (bm.type === 'chapter') navigateToChapter(bm.id);
        else scrollToSection(bm.id);
        $('#bookmarks-panel').classList.remove('open');
      });
      content.appendChild(item);
    });
  }

  const existing = panel.querySelector('.bookmarks-content');
  if (existing) existing.replaceWith(content);
  else panel.appendChild(content);
}

// ── Scroll Helpers ────────────────────────────────────────────
function scrollToSection(secId) {
  const el = document.getElementById(secId);
  if (el) {
    const offset = el.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: offset, behavior: 'smooth' });
  }
}

function observeScroll() {
  const scrollBtn = $('#scroll-top');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) scrollBtn?.classList.add('show');
    else scrollBtn?.classList.remove('show');

    // Update active sidebar section
    const sections = document.querySelectorAll('.content-section');
    let active = null;
    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= 100) active = sec.id;
    });
    if (active) setActiveSidebarSection(active);
  });

  scrollBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── Progress Tracking ─────────────────────────────────────────

function markChapterDone(chId) {
  const btn = $(`.chapter-btn[data-ch-id="${chId}"]`);
  if (!btn) return;
  btn.classList.add('done');
  const numEl = btn.querySelector('.ch-num');
  if (numEl) numEl.textContent = '✓';
  updateProgressPill();
}

function showCompletionBanner(chId, pct) {
  const existing = document.getElementById('completion-banner');
  if (existing) existing.remove();

  const meta = CHAPTER_META.find(m => m.id === chId);
  const banner = el('div', '', '');
  banner.id = 'completion-banner';
  banner.style.cssText = `
    position: fixed; bottom: 80px; right: 24px;
    background: var(--success-soft); border: 1px solid var(--success);
    border-radius: var(--radius-lg); padding: 16px 20px;
    box-shadow: var(--shadow-md); z-index: 200;
    font-size: 0.875rem; color: var(--text);
    max-width: 280px; animation: slideInBanner 0.3s ease both;
  `;
  banner.innerHTML = `
    <div style="font-weight:700;font-size:1rem;margin-bottom:4px;color:#3a6035">
      🎉 Chapter Complete!
    </div>
    <div style="color:var(--text-secondary)">${meta ? meta.title : chId}</div>
    <div style="font-size:0.8rem;color:var(--text-tertiary);margin-top:4px">Quiz score: ${pct}%</div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.5s';
    setTimeout(() => banner.remove(), 500);
  }, 3500);
}

function updateProgressPill() {
  const completed = Object.values(AppState.progress).filter(p => p.completed).length;
  const total = CHAPTER_META.length;
  const pct = Math.round((completed / total) * 100);

  const pill = $('#progress-pill');
  if (!pill) return;
  pill.querySelector('.pill-fill').style.width = `${pct}%`;
  pill.querySelector('.pill-text').textContent = `${completed}/${total} chapters`;
}

// ── Keyboard Shortcuts ────────────────────────────────────────
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter = run code in focused code area
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const focused = document.activeElement;
      if (focused?.classList.contains('code-area')) {
        const pnlId = focused.id.replace('code-area-', '');
        runCode(pnlId);
        e.preventDefault();
      }
    }
    // Escape = close panels
    if (e.key === 'Escape') {
      $('#bookmarks-panel')?.classList.remove('open');
      $('#search-results')?.classList.remove('open');
    }
    // / = focus search
    if (e.key === '/' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
      $('#search-input')?.focus();
      e.preventDefault();
    }
  });
}

// ── Init on DOM ready ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
