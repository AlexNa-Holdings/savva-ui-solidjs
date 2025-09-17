// src/x/pages/admin/AdminContent.jsx
import { Switch, Match } from "solid-js";
import DomainConfigPage from "./DomainConfigPage.jsx";

export default function AdminContent(props) {
  return (
    <Switch>
      <Match when={props.pageKey === "domain-config"}>
        <DomainConfigPage />
      </Match>
    </Switch>
  );
}