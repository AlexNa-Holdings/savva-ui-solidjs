// src/index.jsx
import { render } from "solid-js/web";
import "./index.css";
import App from "./components/App.jsx";
import { AppProvider } from "./context/AppContext.jsx";

const root = document.getElementById("root");

render(() => (
  <AppProvider>
    <App />
  </AppProvider>
), root);