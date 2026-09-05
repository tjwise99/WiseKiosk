// Exists only on the throwaway seed/codeql-2026-09-05 branch, to prove CodeQL's js/xss query
// fires against the production analysis. Never merged.
const target = document.getElementById("output");
if (target !== null) {
  target.innerHTML = location.hash.substring(1);
}
