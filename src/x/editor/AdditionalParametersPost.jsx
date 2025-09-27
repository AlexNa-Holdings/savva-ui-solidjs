// src/x/editor/AdditionalParametersPost.jsx
import { createMemo, createResource, createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import { ChevronDownIcon } from "../ui/icons/ActionIcons.jsx";

function buildCategoryTree(categories = []) {
  const root = [];
  const byPath = new Map();
  const selectable = new Set(categories.map((c) => c.full));

  categories.forEach((item) => {
    const parts = String(item.full || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return;

    let parent = null;
    const acc = [];
    parts.forEach((part) => {
      acc.push(part);
      const path = acc.join("/");

      let node = byPath.get(path);
      if (!node) {
        node = { name: part, path, selectable: false, children: [] };
        byPath.set(path, node);
        if (parent) {
          parent.children.push(node);
        } else {
          root.push(node);
        }
      }

      if (selectable.has(path)) {
        node.selectable = true;
      }

      parent = node;
    });
  });

  const ensureSelectable = (nodes) => {
    nodes.forEach((node) => {
      if (node.children.length > 0 && !node.selectable) {
        node.selectable = true;
      }
      if (node.children.length > 0) ensureSelectable(node.children);
    });
  };

  ensureSelectable(root);

  return root;
}

export default function AdditionalParametersPost(props) {
  const app = useApp();
  const { t } = app;

  const isCommentMode = () => {
    const m = props.editorMode?.() || "";
    return m === "new_comment" || m === "edit_comment";
  };
  const isEditPost = () => (props.editorMode?.() || "") === "edit_post";
  const lang = () => (props.activeLang?.() || app.lang?.() || "en").toLowerCase();

  const labelCls = "font-medium justify-self-end text-right";

  // Load categories (localized; supports A/B/C)
  const categoriesRel = createMemo(() => app.domainAssetsConfig?.()?.modules?.categories || null);
  const [categoriesRes] = createResource(
    () => ({ rel: categoriesRel(), l: lang() }),
    async ({ rel, l }) => {
      if (!rel) return [];
      const data = await loadAssetResource(app, rel, { type: "yaml" }).catch(() => null);
      const raw = data?.locales?.[l] || data?.locales?.en || [];
      return (Array.isArray(raw) ? raw : [])
        .map(String)
        .map((full) => {
          const parts = full.split("/").map(s => s.trim()).filter(Boolean);
          return { full, depth: Math.max(0, parts.length - 1), leaf: parts[parts.length - 1] || full };
        });
    }
  );

  // Localized params
  const localizedParams = createMemo(() => {
    const p = props.postParams?.() || {};
    const loc = p.locales || {};
    return loc[lang()] || {};
  });
  const selectedCategories = createMemo(() => {
    const arr = localizedParams()?.categories;
    return Array.isArray(arr) ? arr : [];
  });

  function updateLocalized(patch) {
    props.setPostParams?.((prev) => {
      const prevObj = prev || {};
      const locales = { ...(prevObj.locales || {}) };
      const current = { ...(locales[lang()] || {}) };
      locales[lang()] = { ...current, ...patch };
      return { ...prevObj, locales };
    });
  }
  function toggleCategory(cat) {
    const set = new Set(selectedCategories());
    set.has(cat) ? set.delete(cat) : set.add(cat);
    updateLocalized({ categories: Array.from(set) });
  }

  // Tags — allow any text while typing; normalize on blur/enter only
  const [tagsText, setTagsText] = createSignal("");
  createMemo(() => {
    const arr = localizedParams()?.tags;
    setTagsText(Array.isArray(arr) ? arr.join(", ") : "");
  });

  const normalizeTag = (s) => String(s || "").trim().replace(/\s+/g, " ");
  function commitTagsFromText() {
    const arr = String(tagsText() || "")
      .split(",")
      .map(normalizeTag)
      .filter(Boolean);
    updateLocalized({ tags: Array.from(new Set(arr)) });
  }
  function onTagsInput(e) {
    // Do not normalize while typing; just mirror text so spaces/commas work naturally
    setTagsText(e.currentTarget.value);
  }
  function onTagsKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTagsFromText();
    }
  }
  function onTagsBlur() {
    commitTagsFromText();
  }

  // Popover (auto-flip)
  const [openCats, setOpenCats] = createSignal(false);
  const [openUp, setOpenUp] = createSignal(false);
  const [expandedCats, setExpandedCats] = createSignal(new Set());
  let catsRoot;
  function decidePlacement() {
    if (!catsRoot || !openCats()) return;
    const rect = catsRoot.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const estHeight = 320;
    const spaceBelow = vh - rect.bottom;
    setOpenUp(spaceBelow < estHeight + 8);
  }
  function onDocClick(e) { if (openCats() && catsRoot && !catsRoot.contains(e.target)) setOpenCats(false); }
  onMount(() => {
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("resize", decidePlacement, { passive: true });
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocClick);
    window.removeEventListener("resize", decidePlacement);
  });
  const openToggle = () => { const n = !openCats(); setOpenCats(n); if (n) requestAnimationFrame(decidePlacement); };

  const categoryTree = createMemo(() => buildCategoryTree(categoriesRes() || []));

  createEffect(() => {
    // Ensure ancestors of selected categories stay expanded
    const selected = selectedCategories();
    if (!selected) return;
    setExpandedCats((prev) => {
      let changed = false;
      const next = new Set(prev);
      selected.forEach((full) => {
        const parts = String(full || "")
          .split("/")
          .map((part) => part.trim())
          .filter(Boolean);
        for (let i = 1; i < parts.length; i += 1) {
          const ancestor = parts.slice(0, i).join("/");
          if (!next.has(ancestor)) {
            next.add(ancestor);
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  });

  const toggleExpanded = (path) => {
    if (!path) return;
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const CatChip = (p) => (
    <span
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm border
             bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
      title={p.name}
    >
      {p.name}
      <button type="button" class="ml-0.5 rounded hover:opacity-80" aria-label={app.t("common.remove")} onClick={() => toggleCategory(p.name)}>×</button>
    </span>
  );

  const CategoryOption = (nodeProps) => {
    const { node, depth } = nodeProps;
    const isExpanded = () => expandedCats().has(node.path);
    const isChecked = () => selectedCategories().includes(node.path);
    const indentPx = () => `${Math.min(depth, 5) * 16}px`;

    return (
      <li>
        <div
          class="flex items-center gap-2 rounded hover:bg-[hsl(var(--accent))]"
          style={{ padding: "4px 8px", "padding-left": `calc(${indentPx()} + 4px)` }}
        >
          <Show when={node.children.length > 0} fallback={<span class="w-6" />}> 
            <button
              type="button"
              class="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(var(--secondary))]"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpanded(node.path); }}
            >
              <ChevronDownIcon class={`w-4 h-4 transition-transform ${isExpanded() ? "rotate-180" : ""}`} />
            </button>
          </Show>
          <label class={`flex items-center gap-2 flex-1 cursor-pointer ${node.selectable ? "" : "opacity-60"}`} title={node.path}>
            <input
              type="checkbox"
              class="accent-current"
              checked={isChecked()}
              disabled={!node.selectable}
              onInput={() => node.selectable && toggleCategory(node.path)}
              aria-label={node.name}
            />
            <span class="text-sm truncate">{node.name}</span>
          </label>
        </div>
        <Show when={node.children.length > 0 && isExpanded()}>
          <ul class="space-y-0.5 pl-0">
            <For each={node.children}>
              {(child) => <CategoryOption node={child} depth={depth + 1} />}
            </For>
          </ul>
        </Show>
      </li>
    );
  };

  return (
    <section class="mt-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
      <h3 class="text-lg font-medium mb-3">{app.t("editor.params.title")}</h3>

      <div class="grid grid-cols-[12rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
        {/* NSFW */}
        <label class={labelCls}>{app.t("editor.params.nsfw.label")}</label>
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!(props.postParams?.()?.nsfw)}
            onInput={(e) => props.setPostParams?.((p) => ({ ...(p || {}), nsfw: e.currentTarget.checked }))}
            aria-label={app.t("editor.params.nsfw.label")}
          />
          <div class="text-xs opacity-70">{app.t("editor.params.nsfw.help")}</div>
        </div>

        {/* Fundraising */}
        <Show when={!isCommentMode()}>
          <label class={labelCls}>{app.t("editor.params.fundraiser.label")}</label>
          <input
            type="number" min="0"
            class="w-[220px] px-3 h-9 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
            value={props.postParams?.()?.fundraiser ?? ""}
            onInput={(e) => {
              const raw = e.currentTarget.value.trim();
              const v = raw === "" ? "" : Math.max(0, parseInt(raw || "0", 10) || 0);
              props.setPostParams?.((p) => ({ ...(p || {}), fundraiser: v }));
            }}
            aria-label={app.t("editor.params.fundraiser.label")}
          />
        </Show>

        {/* Categories */}
        <Show when={!isCommentMode()}>
          <label class={labelCls}>{app.t("editor.params.categories")}</label>
          <div class="relative" ref={(el) => (catsRoot = el)}>
            <div class="flex flex-wrap items-center gap-2 min-h-[38px]">
              <Show when={selectedCategories().length > 0} fallback={<div class="text-xs text-[hsl(var(--muted-foreground))]">{app.t("categories.none")}</div>}>
                <For each={selectedCategories()}>{(c) => <CatChip name={c} />}</For>
              </Show>
              <button
                type="button"
                class="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
                aria-haspopup="true" aria-expanded={openCats() ? "true" : "false"}
                aria-label={app.t("common.select")} title={app.t("common.select")}
                onClick={openToggle}
              >
                <ChevronDownIcon class={`w-4 h-4 transition-transform ${openCats() ? "rotate-180" : ""}`} />
              </button>
            </div>

            <Show when={openCats()}>
              <div
                class="absolute z-20 w-[min(520px,92vw)] max-h-80 overflow-y-auto rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black/10 p-1"
                style={{
                  top: openUp() ? undefined : "100%",
                  bottom: openUp() ? "100%" : undefined,
                  marginTop: openUp() ? undefined : "0.25rem",
                  marginBottom: openUp() ? "0.25rem" : undefined,
                  left: "0",
                }}
              >
                <Show when={!categoriesRes.loading} fallback={<div class="text-xs opacity-70 px-2 py-1">{app.t("common.loading")}…</div>}>
                  <Show when={(categoriesRes() || []).length > 0} fallback={<div class="text-xs opacity-70 px-2 py-1">—</div>}>
                    <ul class="space-y-0.5 pl-0">
                      <For each={categoryTree()}>
                        {(node) => <CategoryOption node={node} depth={0} />}
                      </For>
                    </ul>
                  </Show>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        {/* Tags (free text while typing; normalize on blur/enter) */}
        <Show when={!isCommentMode()}>
          <label class={labelCls}>{app.t("profile.tabs.tags")}</label>
          <input
            type="text"
            class="w-full max-w-[560px] px-3 h-9 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
            value={tagsText()}
            onInput={onTagsInput}
            onKeyDown={onTagsKeyDown}
            onBlur={onTagsBlur}
            aria-label={app.t("profile.tabs.tags")}
            placeholder="tag one, tag two, long phrase tag"
          />
        </Show>

        {/* Publish-as-new — edit_post only */}
        <Show when={isEditPost()}>
          <label class={labelCls}>{t("editor.params.publishAsNew.label")}</label>
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!(props.postParams?.()?.publishAsNewPost)}
              onInput={(e) => props.setPostParams?.((p) => ({ ...(p || {}), publishAsNewPost: e.currentTarget.checked }))}
              aria-label={t("editor.params.publishAsNew.label")}
            />
            <div class="text-xs opacity-70">{t("editor.params.publishAsNew.help")}</div>
          </div>
        </Show>
      </div>
    </section>
  );
}
