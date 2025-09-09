// src/index.jsx

// --- START DEBUG TRACE FOR LOCALSTORAGE ---
if (typeof window !== "undefined" && window.localStorage) {
  const originalSetItem = window.localStorage.setItem;
  window.localStorage.setItem = function(key, value) {
    if (key === 'lang') {
      console.groupCollapsed(`[storage-trace] localStorage.setItem('lang', '${value}')`);
      console.trace("Stack trace:");
      console.groupEnd();
    }
    originalSetItem.apply(this, arguments);
  };
}
// --- END DEBUG TRACE ---


import { render } from "solid-js/web";
import "./index.css";
import App from "./x/App.jsx";
import { AppProvider } from "./context/AppContext.jsx";

const root = document.getElementById("root");

render(() => (
  <AppProvider>
    <App />
  </AppProvider>
), root);