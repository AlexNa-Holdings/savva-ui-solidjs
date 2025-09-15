// src/x/ui/social/formSocialLink.jsx
import { useApp } from "../../context/AppContext.jsx";
import { TelegramIcon, XIcon, FacebookIcon } from "../ui/icons/SocialIcons.jsx";

/**
 * Detect known social network by URL host.
 */
export function detectSocialNetwork(rawUrl) {
  if (!rawUrl) return null;

  // Normalize for parsing (add scheme if missing)
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawUrl) ? rawUrl : `https://${rawUrl.replace(/^\/+/, "")}`;

  let host = "";
  try {
    host = new URL(normalized).host.toLowerCase();
  } catch {
    return null;
  }

  const rules = [
    { key: "telegram", hosts: ["t.me", "telegram.me", "telegram.org", "telegram.dog"], Icon: TelegramIcon },
    { key: "x",        hosts: ["x.com", "twitter.com", "mobile.twitter.com"],           Icon: XIcon },
    { key: "facebook", hosts: ["facebook.com", "m.facebook.com", "fb.com"],             Icon: FacebookIcon },
  ];

  for (const r of rules) {
    if (r.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return { network: r.key, Icon: r.Icon };
  }
  return null;
}

/**
 * Ensure URL is absolute for href usage (keeps original if already absolute).
 */
function toAbsoluteUrl(u) {
  if (!u) return "#";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) ? u : `https://${u.replace(/^\/+/, "")}`;
}

/**
 * formSocialLink(title, url, opts?) -> JSX <a> element
 * - Adds appropriate social icon when URL matches a known network.
 * - If no title is provided but a known icon is found, renders icon-only link.
 * - Always provides accessible labels via title/aria-label using i18n.
 */
export default function formSocialLink(title, url, opts = {}) {
  const app = useApp();
  const { t } = app;

  const detection = detectSocialNetwork(url);
  const Icon = detection?.Icon;
  const href = toAbsoluteUrl(url);

  const hasTitle = typeof title === "string" && title.trim().length > 0;

  // Accessible label / tooltip (localized)
  const networkLabel = detection ? t(`social.${detection.network}`) : null;
  const a11yLabel = hasTitle
    ? title.trim()
    : detection
      ? t("social.openOnNetwork", { network: networkLabel })
      : href;

  const className =
    opts.class ||
    "inline-flex items-center gap-1.5 underline hover:opacity-80";

  const iconClass = opts.iconClass || "w-5 h-5";

  return (
    <a
      href={href}
      target={opts.target ?? "_blank"}
      rel={opts.rel ?? "noopener noreferrer nofollow"}
      class={className}
      title={a11yLabel}
      aria-label={a11yLabel}
    >
      {Icon && <Icon class={iconClass} />}
      {/* If no title and we have an icon — render icon-only link (no text) */}
      {hasTitle ? <span>{title}</span> : !Icon ? <span>{href}</span> : null}
    </a>
  );
}
