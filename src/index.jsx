import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import { AppProvider } from "./context/AppContext.jsx";
import { WsProvider } from "./net";

const root = document.getElementById("root");

render(() => (
  <AppProvider>
    <WsProvider>
      <App />
    </WsProvider>
  </AppProvider>
), root);
