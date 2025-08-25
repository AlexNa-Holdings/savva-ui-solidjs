// src/components/post/PostTags.jsx
import { createMemo, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

// A reusable pill component for consistent styling
function TagPill(props) {
    return (
        <div class="px-2.5 py-1 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-xs font-medium">
            {props.children}
        </div>
    );
}

export default function PostTags(props) {
    const { lang } = useApp();

    const localizedContent = createMemo(() => {
        const currentLang = lang();
        const locales = props.postData?.savva_content?.locales;
        if (!locales) return null;
        
        // Use the current language, fallback to English, or the first available locale
        const firstLocaleKey = Object.keys(locales)[0];
        return locales[currentLang] || locales.en || (firstLocaleKey ? locales[firstLocaleKey] : null);
    });

    // Categories are an array from the localized content
    const categories = createMemo(() => {
        const content = localizedContent();
        const cats = content?.categories;
        return Array.isArray(cats) ? cats : [];
    });

    // Tags are also an array from the localized content
    const tags = createMemo(() => {
        const content = localizedContent();
        const t = content?.tags;
        return Array.isArray(t) ? t : [];
    });

    return (
        <Show when={categories().length > 0 || tags().length > 0}>
            <div class="flex flex-wrap items-center gap-2 pt-1">
                <For each={categories()}>
                    {(category) => <TagPill>{category}</TagPill>}
                </For>
                <For each={tags()}>
                    {(tag) => <TagPill>#{tag}</TagPill>}
                </For>
            </div>
        </Show>
    );
}