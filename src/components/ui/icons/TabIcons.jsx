// src/components/ui/icons/TabIcons.jsx
/* src/components/ui/icons/TabIcons.jsx */
export function CrownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} aria-hidden="true" fill="none">
      <path d="M4 18h16M5 18l1-9 5 4 5-4 1 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function TrendingUpIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} aria-hidden="true" fill="none">
      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M15 7h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function ChatBubbleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} aria-hidden="true" fill="none">
      <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 4V8a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M8 11h8M8 14h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

export function SparklesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} aria-hidden="true" fill="none">
      <path d="M12 4l1.7 4.2L18 10l-4.3 1.8L12 16l-1.7-4.2L6 10l4.3-1.8L12 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M6 4.5l.8 1.9L9 7.2 7 8 6.2 10 5.4 8 3.5 7.2l2.1-.8L6 4.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    </svg>
  );
}

export function HeartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} aria-hidden="true" fill="none">
      <path d="M12 20s-7-4.3-9-8.5C1.8 8.1 3.7 6 6.2 6c1.9 0 3.4 1 4.8 2.7C12.4 7 13.9 6 15.8 6c2.5 0 4.4 2.1 3.2 5.5C19 15.7 12 20 12 20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
    </svg>
  );
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Returns a JSX icon for a known tab type (leaders, actual, comments, new, for-you).
 * Falls back to null.
 */
export function tabIconFor(type) {
  switch (normalize(type)) {
    case "leaders":   return <CrownIcon />;
    case "actual":    return <TrendingUpIcon />;
    case "comments":  return <ChatBubbleIcon />;
    case "new":       return <SparklesIcon />;
    case "for-you":   return <HeartIcon />;
    default:          return null;
  }
}
