// src/x/pages/admin/AdminContent.jsx
import { Switch, Match } from "solid-js";
import DomainConfigPage from "./DomainConfigPage.jsx";
import BroadcastPage from "./BroadcastPage.jsx";

export default function AdminContent(props) {
  return (
    <Switch>
      <Match when={props.pageKey === "domain-config"}>
        <DomainConfigPage />
      </Match>
      <Match when={props.pageKey === "broadcast"}>
        <BroadcastPage />
      </Match>
    </Switch>
  );
}
