// src/x/pages/admin/AdminContent.jsx
import { Switch, Match } from "solid-js";
import DomainConfigPage from "./DomainConfigPage.jsx";
import BroadcastPage from "./BroadcastPage.jsx";
import LogsPage from "./LogsPage.jsx";

export default function AdminContent(props) {
  return (
    <Switch>
      <Match when={props.pageKey === "domain-config"}>
        <DomainConfigPage />
      </Match>
      <Match when={props.pageKey === "broadcast"}>
        <BroadcastPage />
      </Match>
      <Match when={props.pageKey === "logs"}>
        <LogsPage />
      </Match>
    </Switch>
  );
}
