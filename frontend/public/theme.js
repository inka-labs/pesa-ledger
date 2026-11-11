// Apply the chosen theme before the first paint (no flash); "system" leaves it to the OS.
// A file of its own, not inline, so the page's Content-Security-Policy can allow only the app's own scripts.
try {
  var t = localStorage.getItem("pesa-ledger.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
