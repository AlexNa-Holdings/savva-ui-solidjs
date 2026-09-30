// src/x/profile/UserTagsPanel.jsx
import { createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import TagList from "./TagList.jsx";

async function fetchUserTags({ app, user_addr, lang }) {
  if (!app.wsMethod || !user_addr || !lang) return [];
  try {
    const getTags = app.wsMethod("get-user-tags");
    const res = await getTags({
      domain: app.selectedDomainName(),
      user_addr,
      locale: lang,
    });
    return Array.isArray(res) ? res.sort() : [];
  } catch (e) {
    console.error("Failed to fetch user tags:", e);
    return [];
  }
}

// Tag filter shown under the profile section menu while the Posts tab is active.
// Renders nothing if the user has no tags.
export default function UserTagsPanel(props) {
  const app = useApp();
  const { t } = app;

  const [tags] = createResource(
    () => ({ app, user_addr: props.userAddress, lang: app.lang() }),
    fetchUserTags
  );

  return (
    <Show when={!tags.loading && tags()?.length > 0}>
      <div class="border border-[hsl(var(--border))] rounded-lg p-2">
        <h4 class="text-sm font-semibold mb-2 px-1">{t("profile.tabs.tags")}</h4>
        <TagList
          tags={tags()}
          selectedTags={props.selectedTags}
          onTagToggle={props.onTagToggle}
        />
      </div>
    </Show>
  );
}
