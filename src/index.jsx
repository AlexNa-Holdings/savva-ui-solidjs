import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import { AppProvider } from "./context/AppContext.jsx";

const root = document.getElementById("root");

render(() => (
  <AppProvider>
    <App />
  </AppProvider>
), root);
