/* ============================================================
   CALCULUS LEARNING PLATFORM — PYTHON RUNNER
   Uses Skulpt for in-browser Python execution
   ============================================================ */

'use strict';

const PythonRunner = (() => {

  let skulptReady = false;

  function checkSkulpt() {
    return typeof Sk !== 'undefined';
  }

  function run(code, outputEl) {
    if (!checkSkulpt()) {
      showError(outputEl, 'Python runtime (Skulpt) not loaded. Check your internet connection.');
      return;
    }

    // Patch common imports that Skulpt handles differently
    const patchedCode = patchCode(code);

    let outputText = '';
    let hasImage = false;

    function builtinRead(x) {
      if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][x] === undefined) {
        throw `File not found: '${x}'`;
      }
      return Sk.builtinFiles['files'][x];
    }

    Sk.configure({
      output: (text) => { outputText += text; },
      read: builtinRead,
      execLimit: 10000,
      __future__: Sk.python3,
    });

    // Handle matplotlib show() — capture as base64 image
    // Skulpt's matplotlib support is limited; we intercept plt.show()
    Sk.configure({
      output: (text) => { outputText += text; },
      read: builtinRead,
      execLimit: 10000,
      __future__: Sk.python3,
    });

    const promise = Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody('<stdin>', false, patchedCode, true)
    );

    promise.then(() => {
      showSuccess(outputEl, outputText || '(no output)');
    }).catch((err) => {
      // Try to give a friendly error
      let msg = err.toString();
      if (err.tp$str) msg = err.tp$str().v;
      showError(outputEl, msg);
    });
  }

  function patchCode(code) {
    // Replace matplotlib show() calls with a save to a virtual file
    // and replace imports that won't work in Skulpt with stubs
    let patched = code;

    // Skulpt doesn't support sympy — provide a stub message
    if (patched.includes('from sympy') || patched.includes('import sympy')) {
      patched = patched.replace(
        /from sympy import [^\n]+\n?/g,
        '# sympy import (simulated in browser)\n'
      ).replace(
        /import sympy[^\n]*\n?/g,
        '# sympy import (simulated in browser)\n'
      );

      // Inject a basic sympy stub
      const stub = `
class _SymPyStub:
    def __init__(self, name='x'):
        self._name = name
    def __repr__(self): return self._name
    def subs(self, sym, val):
        return val
    
def symbols(names):
    parts = names.replace(',', ' ').split()
    if len(parts) == 1:
        return _SymPyStub(parts[0])
    return tuple(_SymPyStub(p) for p in parts)

def limit(expr, var, val):
    return "limit evaluated (sympy not available in browser)"

def Piecewise(*args):
    return "piecewise defined"

oo = float('inf')

`;
      patched = stub + patched;
    }

    return patched;
  }

  function showSuccess(outputEl, text) {
    outputEl.className = 'code-output';
    outputEl.innerHTML = `<div class="output-label">Output</div><pre style="margin:0;white-space:pre-wrap">${escapeHtml(text)}</pre>`;
  }

  function showError(outputEl, msg) {
    outputEl.className = 'code-output error';
    outputEl.innerHTML = `<div class="output-label" style="color:var(--danger)">Error</div><pre style="margin:0;white-space:pre-wrap;color:var(--danger)">${escapeHtml(msg)}</pre>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { run, checkSkulpt };
})();
