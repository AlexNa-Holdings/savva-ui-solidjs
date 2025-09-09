// src/x/ui/SvgImage.jsx
import { createResource, Show, createMemo } from "solid-js";

// Basic sanitizer to prevent XSS from potentially malicious SVG content
const sanitizeSvg = (svgText) => {
  if (!svgText) return "";
  // Remove script tags and all "on..." event handlers (e.g., onload, onclick)
  return svgText
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s(on\w+)=("([^"]*)"|'([^']*)'|[^\s>]+)/gi, "");
};

async function fetchSvg(src) {
  if (!src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.error(`Failed to fetch SVG at ${src}`, e);
    return null;
  }
}

export default function SvgImage(props) {
  const [svgContent] = createResource(() => props.src, fetchSvg);

  const aspectRatio = createMemo(() => {
    const text = svgContent();
    if (!text) return '1 / 1';
    
    const viewBoxMatch = text.match(/viewBox="([0-9.\s-]+)"/);
    if (viewBoxMatch && viewBoxMatch[1]) {
      const parts = viewBoxMatch[1].trim().split(/\s+/);
      if (parts.length === 4) {
        const width = parseFloat(parts[2]);
        const height = parseFloat(parts[3]);
        if (width > 0 && height > 0) return `${width} / ${height}`;
      }
    }

    const widthMatch = text.match(/width="([^"]+)"/);
    const heightMatch = text.match(/height="([^"]+)"/);
    if (widthMatch && heightMatch) {
      const w = parseFloat(widthMatch[1]);
      const h = parseFloat(heightMatch[1]);
      if (w > 0 && h > 0) return `${w} / ${h}`;
    }

    return '1 / 1'; // Default to square if no dimensions are found
  });

  return (
    <Show when={svgContent()}>
      {(svgText) => (
        <div
          class={`sv-svg-container ${props.class || ""}`}
          style={{ ...props.style, "aspect-ratio": aspectRatio() }}
          innerHTML={sanitizeSvg(svgText())}
          aria-label={props.alt}
          role="img"
        />
      )}
    </Show>
  );
}