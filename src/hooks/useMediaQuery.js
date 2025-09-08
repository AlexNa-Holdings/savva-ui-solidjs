// src/hooks/useMediaQuery.js
import { createSignal, onMount, onCleanup } from "solid-js";

export function useMediaQuery(query) {
  const [matches, setMatches] = createSignal(false);

  onMount(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches()) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    onCleanup(() => media.removeEventListener("change", listener));
  });

  return matches;
}
