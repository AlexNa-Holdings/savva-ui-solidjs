// src/x/navigation/CategoryBrowser.jsx
import { createMemo, For, createSignal, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useDomainCategories } from "../../hooks/useDomainCategories.js";
import { navigate } from "../../routing/hashRouter.js";
import { tabPath } from "../../routing/tabRoutes.js";
import { ChevronDownIcon } from "../ui/icons/ActionIcons.jsx";
import Spinner from "../ui/Spinner.jsx";

function parseCategoryTree(paths) {
  const root = { children: [] };
  if (!paths) return root.children;
  paths.forEach(path => {
    let currentLevel = root;
    path.split('/').forEach((part, index, parts) => {
      const fullPath = parts.slice(0, index + 1).join('/');
      let node = currentLevel.children.find(child => child.path === fullPath);
      if (!node) {
        node = { name: part, path: fullPath, children: [] };
        currentLevel.children.push(node);
      }
      currentLevel = node;
    });
  });
  return root.children;
}


function CategoryNode(props) {
  const [isOpen, setIsOpen] = createSignal(false);
  const { lang } = useApp();

  const handleCategoryClick = (e, path) => {
    e.preventDefault();
    e.stopPropagation();
    const categoryQuery = encodeURIComponent(`${lang()}:${path}`);
    navigate(`${tabPath('new')}?category=${categoryQuery}`);
    props.onNavigate?.();
  };

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen());
  };

  return (
    <li>
      <div class="sv-leftnav__item">
        <a href="#" onClick={(e) => handleCategoryClick(e, props.node.path)} class="flex-1 min-w-0">
          <span class="sv-leftnav__label truncate">{props.node.name}</span>
        </a>
        <Show when={props.node.children.length > 0}>
          <button onClick={handleToggle} class="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <ChevronDownIcon class={`w-4 h-4 transition-transform ${isOpen() ? 'rotate-180' : ''}`} />
          </button>
        </Show>
      </div>
      <Show when={isOpen() && props.node.children.length > 0}>
        <ul class="pl-4">
          <For each={props.node.children}>
            {child => <CategoryNode node={child} onNavigate={props.onNavigate} />}
          </For>
        </ul>
      </Show>
    </li>
  );
}


export default function CategoryBrowser(props) {
  const app = useApp();
  const categories = useDomainCategories(app);
  const categoryTree = createMemo(() => {
    const paths = categories();
    return parseCategoryTree(paths);
  });

  return (
    <Show when={!categories.loading} fallback={<div class="p-2"><Spinner class="w-5 h-5 mx-auto" /></div>}>
      <Show when={categoryTree().length > 0}>
        <div class="sv-leftnav__section">
          <div class="sv-leftnav__sectionTitle">{app.t("nav.section.categories")}</div>
          <ul class="sv-leftnav__list">
            <For each={categoryTree()}>
              {node => <CategoryNode node={node} onNavigate={props.onNavigate} />}
            </For>
          </ul>
        </div>
      </Show>
    </Show>
  );
}