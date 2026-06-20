/* ============================================================
   CALCULUS LEARNING PLATFORM — ENHANCED GRAPH MODULE
   Chunk 2: Derivative viz, tangent line, secant animation,
            f'(x) overlay, Riemann sums, slider controls
   ============================================================ */

'use strict';

/* ══════════════════════════════════════════════════════════════
   GraphModule — replaces the basic renderVisualSubsec graphs
   with a full interactive panel based on the "type" field in
   the chapter JSON graph config.

   Supported types:
     "function"   — basic f(x) plot with editable expression
     "derivative" — f(x) + f'(x) overlay + movable tangent line
     "integral"   — f(x) + shaded area + Riemann sum slider
══════════════════════════════════════════════════════════════ */

const GraphModule = (() => {

  // ── Numerical derivative via central difference ───────────
  function numericalDeriv(expr, xVal, h = 1e-6) {
    try {
      const scope = {};
      scope.x = xVal + h;
      const fp = math.evaluate(expr, scope);
      scope.x = xVal - h;
      const fm = math.evaluate(expr, scope);
      return (fp - fm) / (2 * h);
    } catch(e) { return NaN; }
  }

  // ── Safe expression evaluator ─────────────────────────────
  function evalExpr(expr, xVal) {
    try {
      return math.evaluate(expr, { x: xVal });
    } catch(e) { return NaN; }
  }

  // ── Generate x/y arrays ───────────────────────────────────
  function generateCurve(expr, xMin, xMax, N = 500) {
    const xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const x = xMin + (xMax - xMin) * (i / N);
      const y = evalExpr(expr, x);
      xs.push(x);
      ys.push(isFinite(y) ? y : null);
    }
    return { xs, ys };
  }

  // ── Theme helpers ─────────────────────────────────────────
  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }
  function themeColors() {
    return {
      text:    isDark() ? '#e8e4dd' : '#3d3a35',
      grid:    isDark() ? '#333028' : '#e0dcd5',
      zero:    isDark() ? '#8a8880' : '#5c5a55',
      bg:      'transparent',
      func:    '#8b9dc3',
      deriv:   '#c3a88b',
      tangent: '#a8c3a6',
      riemann: 'rgba(139,157,195,0.35)',
      riemannBorder: '#8b9dc3',
    };
  }

  // ── Shared Plotly layout template ─────────────────────────
  function baseLayout(cfg) {
    const c = themeColors();
    const xMin = (cfg.xRange || [-5, 5])[0];
    const xMax = (cfg.xRange || [-5, 5])[1];
    const yMin = (cfg.yRange || [-5, 5])[0];
    const yMax = (cfg.yRange || [-5, 5])[1];
    return {
      paper_bgcolor: c.bg,
      plot_bgcolor:  c.bg,
      font: { family: 'DM Sans, sans-serif', color: c.text, size: 12 },
      margin: { l: 50, r: 20, t: 10, b: 50 },
      xaxis: {
        range: [xMin, xMax],
        gridcolor: c.grid, gridwidth: 1,
        zerolinecolor: c.zero, zerolinewidth: 1.5,
        showgrid: true, color: c.text,
      },
      yaxis: {
        range: [yMin, yMax],
        gridcolor: c.grid, gridwidth: 1,
        zerolinecolor: c.zero, zerolinewidth: 1.5,
        showgrid: true, color: c.text,
      },
      hovermode: 'closest',
      showlegend: true,
      legend: { x: 0, y: 1, bgcolor: 'rgba(0,0,0,0)', font: { size: 11 } },
    };
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC: Build the graph panel into a DOM element
  //  Called by renderVisualSubsec in app.js (replacement)
  // ══════════════════════════════════════════════════════════
  function build(containerEl, cfg) {
    containerEl.innerHTML = '';
    const type = cfg.type || 'function';
    if      (type === 'derivative') buildDerivativePanel(containerEl, cfg);
    else if (type === 'integral')   buildIntegralPanel(containerEl, cfg);
    else                            buildFunctionPanel(containerEl, cfg);
  }

  // ──────────────────────────────────────────────────────────
  //  TYPE: "function"  —  basic editable plot
  // ──────────────────────────────────────────────────────────
  function buildFunctionPanel(el, cfg) {
    const divId = `graph-fn-${el.id || Math.random().toString(36).slice(2)}`;
    el.innerHTML = `
      <div class="graph-container" style="max-width:100%">
        <div class="graph-controls">
          <label>f(x) =</label>
          <input type="text" id="${divId}-expr" value="${cfg.defaultExpression}" placeholder="e.g. x^2">
          <button class="btn btn-primary" onclick="GraphModule._plotFn('${divId}')">Plot</button>
          <button class="btn btn-outline" onclick="GraphModule._resetFn('${divId}','${cfg.defaultExpression}')">Reset</button>
        </div>
        <div id="${divId}" style="height:360px"></div>
        <div class="graph-note">💡 Edit the expression and click Plot. Supports: sin, cos, exp, log, sqrt, abs, pi, e.</div>
      </div>
    `;
    el._graphCfg = cfg;
    el._graphDivId = divId;
    _plotFn(divId, cfg);
  }

  function _plotFn(divId, cfg) {
    const div = document.getElementById(divId);
    if (!div) return;
    const parentEl = div.closest('[id]');
    const exprEl = document.getElementById(`${divId}-expr`);
    const expr = exprEl ? exprEl.value : (cfg && cfg.defaultExpression) || 'x^2';
    const activeCfg = cfg || (parentEl && parentEl._graphCfg) || { xRange: [-5,5], yRange: [-5,5] };
    const { xs, ys } = generateCurve(expr, activeCfg.xRange[0], activeCfg.xRange[1]);
    const c = themeColors();
    Plotly.newPlot(divId, [{
      x: xs, y: ys, type: 'scatter', mode: 'lines',
      line: { color: c.func, width: 2.5 }, name: `f(x) = ${expr}`, connectgaps: false,
    }], baseLayout(activeCfg), { responsive: true, displayModeBar: false });
  }
  // exposed on window via return
  function _resetFn(divId, defaultExpr) {
    const exprEl = document.getElementById(`${divId}-expr`);
    if (exprEl) exprEl.value = defaultExpr;
    _plotFn(divId);
  }

  // ──────────────────────────────────────────────────────────
  //  TYPE: "derivative"
  //  Shows: f(x), f'(x) overlay, movable tangent line + slope
  //  Also shows secant → tangent animation on demand
  // ──────────────────────────────────────────────────────────
  function buildDerivativePanel(el, cfg) {
    const baseId = `graph-drv-${el.id || Math.random().toString(36).slice(2)}`;
    const plotId = `${baseId}-plot`;
    const initX  = cfg.tangentPoint !== undefined ? cfg.tangentPoint : 0;
    const xMin   = (cfg.xRange || [-3, 4])[0];
    const xMax   = (cfg.xRange || [-3, 4])[1];

    el.innerHTML = `
      <div class="graph-container" style="max-width:100%">
        <div class="graph-controls" style="flex-wrap:wrap;gap:10px">
          <label>f(x) =</label>
          <input type="text" id="${baseId}-expr" value="${cfg.defaultExpression}" style="width:200px">
          <label style="margin-left:8px">Tangent at x =</label>
          <input type="range" id="${baseId}-slider" min="${xMin}" max="${xMax}" step="0.05"
            value="${initX}" style="width:120px;accent-color:var(--accent)"
            oninput="GraphModule._updateTangent('${baseId}')">
          <span id="${baseId}-xval" style="font-family:var(--font-mono);font-size:0.8rem;min-width:36px">${initX.toFixed(2)}</span>
          <button class="btn btn-primary" onclick="GraphModule._replotDerivative('${baseId}')">Plot</button>
          <button class="btn btn-outline" onclick="GraphModule._toggleDerivOverlay('${baseId}')">Toggle f'(x)</button>
        </div>

        <div id="${plotId}" style="height:400px"></div>

        <!-- Info strip -->
        <div style="display:flex;gap:24px;padding:10px 16px;background:var(--card);border-top:1px solid var(--border);font-size:0.82rem;flex-wrap:wrap">
          <div>
            <span style="color:var(--text-tertiary)">f(x₀) = </span>
            <strong id="${baseId}-fy" style="font-family:var(--font-mono)">—</strong>
          </div>
          <div>
            <span style="color:var(--text-tertiary)">f'(x₀) = slope = </span>
            <strong id="${baseId}-slope" style="font-family:var(--font-mono);color:var(--accent)">—</strong>
          </div>
          <div>
            <span style="color:var(--text-tertiary)">Tangent: y = </span>
            <strong id="${baseId}-tline" style="font-family:var(--font-mono);color:#a8c3a6">—</strong>
          </div>
        </div>

        <div class="graph-note">
          💡 Drag the slider to move the tangent point. Toggle f'(x) to see the derivative curve.
          Notice: where f has a peak/valley, f'(x) = 0.
        </div>
      </div>
    `;

    // Store state
    el._derivState = {
      cfg,
      baseId,
      plotId,
      showDeriv: true,
      expr: cfg.defaultExpression,
    };

    _plotDerivative(el._derivState);
    _updateTangentDisplay(baseId, initX, cfg.defaultExpression, cfg);
  }

  function _plotDerivative(state) {
    const { cfg, baseId, plotId, showDeriv, expr } = state;
    const { xs, ys } = generateCurve(expr, cfg.xRange[0], cfg.xRange[1]);
    const c = themeColors();

    const traces = [{
      x: xs, y: ys, type: 'scatter', mode: 'lines',
      line: { color: c.func, width: 2.5 }, name: `f(x) = ${expr}`, connectgaps: false,
    }];

    if (showDeriv) {
      const yds = xs.map(x => {
        const d = numericalDeriv(expr, x);
        return isFinite(d) ? d : null;
      });
      traces.push({
        x: xs, y: yds, type: 'scatter', mode: 'lines',
        line: { color: c.deriv, width: 1.8, dash: 'dot' },
        name: "f'(x)", connectgaps: false,
      });
    }

    // Tangent line placeholder (will be updated by slider)
    const slider = document.getElementById(`${baseId}-slider`);
    const x0 = slider ? parseFloat(slider.value) : (cfg.tangentPoint || 0);
    const tangentTraces = _buildTangentTraces(expr, x0, cfg, c);
    traces.push(...tangentTraces);

    Plotly.newPlot(plotId, traces, baseLayout(cfg), { responsive: true, displayModeBar: false });
  }

  function _buildTangentTraces(expr, x0, cfg, c) {
    const y0    = evalExpr(expr, x0);
    const slope = numericalDeriv(expr, x0);
    if (!isFinite(y0) || !isFinite(slope)) return [];

    // Tangent line over the visible x range
    const xMin = cfg.xRange[0];
    const xMax = cfg.xRange[1];
    const txs  = [xMin, xMax];
    const tys  = txs.map(x => slope * (x - x0) + y0);

    return [
      // Tangent line
      {
        x: txs, y: tys, type: 'scatter', mode: 'lines',
        line: { color: c.tangent, width: 2, dash: 'dash' },
        name: 'Tangent', showlegend: true,
      },
      // Tangent point marker
      {
        x: [x0], y: [y0], type: 'scatter', mode: 'markers',
        marker: { color: c.tangent, size: 9, symbol: 'circle' },
        name: `(${x0.toFixed(2)}, ${y0.toFixed(3)})`,
        showlegend: false,
      },
    ];
  }

  function _updateTangent(baseId) {
    const slider = document.getElementById(`${baseId}-slider`);
    if (!slider) return;
    const x0 = parseFloat(slider.value);
    const xvalEl = document.getElementById(`${baseId}-xval`);
    if (xvalEl) xvalEl.textContent = x0.toFixed(2);

    // Find the parent el that has _derivState
    const panelEl = slider.closest('.subsec-panel') || slider.closest('[id]');
    let state = null;
    document.querySelectorAll('[id]').forEach(el => {
      if (el._derivState && el._derivState.baseId === baseId) state = el._derivState;
    });
    if (!state) return;

    const c = themeColors();
    const tangentTraces = _buildTangentTraces(state.expr, x0, state.cfg, c);
    const plotId = state.plotId;
    const totalTraces = document.getElementById(plotId)?._fullLayout?.data?.length || 3;
    const tangentIdx = state.showDeriv ? 2 : 1;

    // Update only tangent traces
    Plotly.deleteTraces(plotId, state.showDeriv ? [2, 3] : [1, 2]).catch(() => {});
    Plotly.addTraces(plotId, tangentTraces).catch(() => {});

    _updateTangentDisplay(baseId, x0, state.expr, state.cfg);
  }

  function _updateTangentDisplay(baseId, x0, expr, cfg) {
    const y0    = evalExpr(expr, x0);
    const slope = numericalDeriv(expr, x0);

    const fyEl    = document.getElementById(`${baseId}-fy`);
    const slopeEl = document.getElementById(`${baseId}-slope`);
    const tlineEl = document.getElementById(`${baseId}-tline`);

    if (fyEl)    fyEl.textContent    = isFinite(y0)    ? y0.toFixed(4)    : 'undefined';
    if (slopeEl) slopeEl.textContent = isFinite(slope) ? slope.toFixed(4) : 'undefined';
    if (tlineEl && isFinite(slope) && isFinite(y0)) {
      const b = y0 - slope * x0;
      const sign = b >= 0 ? '+' : '-';
      tlineEl.textContent = `${slope.toFixed(3)}x ${sign} ${Math.abs(b).toFixed(3)}`;
    }
  }

  function _replotDerivative(baseId) {
    document.querySelectorAll('[id]').forEach(el => {
      if (el._derivState && el._derivState.baseId === baseId) {
        const exprEl = document.getElementById(`${baseId}-expr`);
        if (exprEl) el._derivState.expr = exprEl.value;
        _plotDerivative(el._derivState);
        const slider = document.getElementById(`${baseId}-slider`);
        if (slider) _updateTangentDisplay(baseId, parseFloat(slider.value), el._derivState.expr, el._derivState.cfg);
      }
    });
  }

  function _toggleDerivOverlay(baseId) {
    document.querySelectorAll('[id]').forEach(el => {
      if (el._derivState && el._derivState.baseId === baseId) {
        el._derivState.showDeriv = !el._derivState.showDeriv;
        _plotDerivative(el._derivState);
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  //  TYPE: "integral"
  //  Shows: f(x), shaded area [a,b], Riemann rectangles
  // ──────────────────────────────────────────────────────────
  function buildIntegralPanel(el, cfg) {
    const baseId = `graph-int-${el.id || Math.random().toString(36).slice(2)}`;
    const plotId = `${baseId}-plot`;
    const initA  = cfg.limitA !== undefined ? cfg.limitA : 0;
    const initB  = cfg.limitB !== undefined ? cfg.limitB : 2;
    const xMin   = (cfg.xRange || [-1, 4])[0];
    const xMax   = (cfg.xRange || [-1, 4])[1];

    el.innerHTML = `
      <div class="graph-container" style="max-width:100%">
        <div class="graph-controls" style="flex-wrap:wrap;gap:10px">
          <label>f(x) =</label>
          <input type="text" id="${baseId}-expr" value="${cfg.defaultExpression}" style="width:160px">
          <label>a=</label>
          <input type="number" id="${baseId}-a" value="${initA}" step="0.1" style="width:56px">
          <label>b=</label>
          <input type="number" id="${baseId}-b" value="${initB}" step="0.1" style="width:56px">
          <label>n=</label>
          <input type="range" id="${baseId}-n" min="1" max="100" value="10"
            style="width:100px;accent-color:var(--accent)"
            oninput="document.getElementById('${baseId}-nval').textContent=this.value;GraphModule._updateRiemann('${baseId}')">
          <span id="${baseId}-nval" style="font-family:var(--font-mono);font-size:0.8rem;min-width:28px">10</span> rectangles
          <button class="btn btn-primary" onclick="GraphModule._replotIntegral('${baseId}')">Plot</button>
        </div>

        <div id="${plotId}" style="height:400px"></div>

        <div style="display:flex;gap:24px;padding:10px 16px;background:var(--card);border-top:1px solid var(--border);font-size:0.82rem;flex-wrap:wrap">
          <div>
            <span style="color:var(--text-tertiary)">Riemann Sum ≈ </span>
            <strong id="${baseId}-rsum" style="font-family:var(--font-mono);color:var(--accent)">—</strong>
          </div>
          <div>
            <span style="color:var(--text-tertiary)">Exact integral = </span>
            <strong id="${baseId}-exact" style="font-family:var(--font-mono)">—</strong>
          </div>
        </div>
        <div class="graph-note">💡 Increase n to make rectangles thinner and the Riemann sum more accurate.</div>
      </div>
    `;

    el._integState = { cfg, baseId, plotId, expr: cfg.defaultExpression };
    _plotIntegral(el._integState, initA, initB, 10);
  }

  function _plotIntegral(state, a, b, n) {
    const { cfg, plotId, expr } = state;
    const { xs, ys } = generateCurve(expr, cfg.xRange[0], cfg.xRange[1]);
    const c = themeColors();

    const traces = [{
      x: xs, y: ys, type: 'scatter', mode: 'lines',
      line: { color: c.func, width: 2.5 }, name: `f(x)`, connectgaps: false,
    }];

    // Shaded area (filled trace)
    const { xs: axs, ys: ays } = generateCurve(expr, a, b, 200);
    const shadeX = [a, ...axs, b, a];
    const shadeY = [0, ...ays, 0, 0];
    traces.push({
      x: shadeX, y: shadeY, type: 'scatter', mode: 'lines',
      fill: 'toself', fillcolor: 'rgba(139,157,195,0.18)',
      line: { color: 'rgba(139,157,195,0.5)', width: 0.5 },
      name: 'Area', showlegend: true,
    });

    // Riemann rectangles (left-endpoint)
    const dx = (b - a) / n;
    let rSum = 0;
    for (let i = 0; i < n; i++) {
      const x0 = a + i * dx;
      const y0 = evalExpr(expr, x0);
      if (!isFinite(y0)) continue;
      rSum += y0 * dx;
      const rx = [x0, x0, x0 + dx, x0 + dx, x0];
      const ry = [0, y0, y0, 0, 0];
      traces.push({
        x: rx, y: ry, type: 'scatter', mode: 'lines',
        fill: 'toself', fillcolor: c.riemann,
        line: { color: c.riemannBorder, width: n > 40 ? 0.3 : 0.8 },
        name: i === 0 ? `Riemann (n=${n})` : undefined,
        showlegend: i === 0,
      });
    }

    Plotly.newPlot(plotId, traces, baseLayout(cfg), { responsive: true, displayModeBar: false });

    // Update displays
    const rsumEl  = document.getElementById(`${state.baseId}-rsum`);
    const exactEl = document.getElementById(`${state.baseId}-exact`);
    if (rsumEl)  rsumEl.textContent  = rSum.toFixed(6);
    if (exactEl) exactEl.textContent = _numericalIntegral(expr, a, b, 1000).toFixed(6);
  }

  function _numericalIntegral(expr, a, b, N = 1000) {
    // Simpson's rule
    const h = (b - a) / N;
    let sum = evalExpr(expr, a) + evalExpr(expr, b);
    for (let i = 1; i < N; i++) {
      const x = a + i * h;
      sum += (i % 2 === 0 ? 2 : 4) * evalExpr(expr, x);
    }
    return sum * h / 3;
  }

  function _updateRiemann(baseId) {
    document.querySelectorAll('[id]').forEach(el => {
      if (el._integState && el._integState.baseId === baseId) {
        const a = parseFloat(document.getElementById(`${baseId}-a`)?.value || 0);
        const b = parseFloat(document.getElementById(`${baseId}-b`)?.value || 2);
        const n = parseInt(document.getElementById(`${baseId}-n`)?.value || 10);
        _plotIntegral(el._integState, a, b, n);
      }
    });
  }

  function _replotIntegral(baseId) {
    document.querySelectorAll('[id]').forEach(el => {
      if (el._integState && el._integState.baseId === baseId) {
        const exprEl = document.getElementById(`${baseId}-expr`);
        if (exprEl) el._integState.expr = exprEl.value;
        el._integState.cfg.defaultExpression = el._integState.expr;
        _updateRiemann(baseId);
      }
    });
  }

  // ── Re-render all visible graphs on theme change ──────────
  function redrawAll() {
    document.querySelectorAll('[id]').forEach(el => {
      if (el._derivState) _plotDerivative(el._derivState);
      if (el._integState) {
        const baseId = el._integState.baseId;
        const a = parseFloat(document.getElementById(`${baseId}-a`)?.value || 0);
        const b = parseFloat(document.getElementById(`${baseId}-b`)?.value || 2);
        const n = parseInt(document.getElementById(`${baseId}-n`)?.value || 10);
        _plotIntegral(el._integState, a, b, n);
      }
    });
  }

  // ── Public API ────────────────────────────────────────────
  return {
    build,
    redrawAll,
    // Exposed for onclick handlers
    _plotFn,
    _resetFn,
    _updateTangent,
    _replotDerivative,
    _toggleDerivOverlay,
    _updateRiemann,
    _replotIntegral,
  };

})();

// Attach to window so onclick attributes can find it
window.GraphModule = GraphModule;

// ══════════════════════════════════════════════════════════════
//  PATCH: Override renderVisualSubsec in app.js
//  This runs after app.js is loaded and replaces the function
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Wait for app.js to define window.renderVisualSubsecOriginal if needed
  // We monkey-patch at the module level by overriding the panel rendering

  // Hook into the dark mode toggle to redraw graphs
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) {
    const originalClick = themeBtn.onclick;
    themeBtn.addEventListener('click', () => {
      // Redraw after theme transition settles
      setTimeout(() => GraphModule.redrawAll(), 50);
    });
  }
});
