/* ============================================================
   Filters — état PARTAGÉ entre toutes les vues (genre + thème)
   ------------------------------------------------------------
   Les vues sont des pages autonomes, affichées en iframe dans
   index.html. Elles partagent le même état via localStorage :
   changer le genre OU le thème dans le hub (ou une vue) met à
   jour tout le monde, et le choix persiste d'une page à l'autre.
   (« un seul système » — vues coordonnées)

   État :
     genre : "" = tous ; sinon une clé de DataLoader.GENRES
             (pop, rap, rock, latin, r&b, edm).
     theme : "auto" (suit le système) | "light" | "dark".

   Le thème est appliqué AUTOMATIQUEMENT par ce fichier sur la page
   qui le charge : il pose data-theme sur <html> (ou le retire en
   "auto"). Les CSS des vues réagissent via :root[data-theme=...].

   API (globale, window.Filters) :
     Filters.get()               -> { genre, theme }
     Filters.set({ genre })      -> change le genre + prévient tout le monde
     Filters.setTheme(theme)     -> change le thème + l'applique partout
     Filters.onChange(fn)        -> fn(state) à chaque changement
     Filters.reset()             -> genre = tous (ne touche pas au thème)
   ============================================================ */
(function () {
  "use strict";

  var KEY = "spotify.filters";
  var THEMES = ["auto", "light", "dark"];
  var state = { genre: "", theme: "auto" };
  var subs = [];

  // relecture du dernier état choisi (persistance entre les pages)
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      if (typeof saved.genre === "string") state.genre = saved.genre;
      if (THEMES.indexOf(saved.theme) !== -1) state.theme = saved.theme;
    }
  } catch (e) { /* localStorage indisponible : état par défaut */ }

  function get() { return { genre: state.genre, theme: state.theme }; }

  // applique le thème à CETTE page : data-theme sur <html> ("auto" = on laisse le système)
  function applyTheme() {
    var root = document.documentElement;
    if (state.theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", state.theme);
  }

  function notify() {
    subs.forEach(function (fn) { try { fn(get()); } catch (e) { /* une vue ne casse pas les autres */ } });
  }

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  function set(patch) {
    if (!patch || typeof patch.genre !== "string" || patch.genre === state.genre) return;
    state.genre = patch.genre;
    persist();
    notify();
  }

  function setTheme(theme) {
    if (THEMES.indexOf(theme) === -1 || theme === state.theme) return;
    state.theme = theme;
    persist();
    applyTheme();
    notify();
  }

  function onChange(fn) { if (typeof fn === "function") subs.push(fn); }
  function reset() { set({ genre: "" }); }

  // Synchro entre documents (iframes du hub, ou onglets) : le storage event
  // ne se déclenche que dans les AUTRES documents quand l'un d'eux écrit.
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    var next = { genre: "", theme: "auto" };
    try { var s = JSON.parse(e.newValue); if (s) { if (typeof s.genre === "string") next.genre = s.genre; if (THEMES.indexOf(s.theme) !== -1) next.theme = s.theme; } } catch (err) { /* ignore */ }
    var themeChanged = next.theme !== state.theme;
    var genreChanged = next.genre !== state.genre;
    if (!themeChanged && !genreChanged) return;
    state = next;
    if (themeChanged) applyTheme();
    notify();
  });

  applyTheme();   // applique le thème dès le chargement de la page
  window.Filters = { get: get, set: set, setTheme: setTheme, onChange: onChange, reset: reset };
})();
