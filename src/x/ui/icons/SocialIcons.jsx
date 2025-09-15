// src/x/ui/icons/SocialIcons.jsx
import { splitProps } from "solid-js";

/* Telegram (kept as-is with its gradient) */
export function TelegramIcon(props) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" fill="none" class={local.class} aria-hidden="true" {...rest}>
      <defs>
        <linearGradient id="tg-grad-outer" x1="-683.305" y1="534.845" x2="-693.305" y2="511.512" gradientUnits="userSpaceOnUse" gradientTransform="matrix(6 0 0 -6 4255 3247)">
          <stop offset="0" stop-color="#37aee2" />
          <stop offset="1" stop-color="#1e96c8" />
        </linearGradient>
        <linearGradient id="tg-grad-light" x1="128.991" y1="118.245" x2="153.991" y2="78.245" gradientUnits="userSpaceOnUse" gradientTransform="matrix(1 0 0 -1 0 242)">
          <stop offset="0" stop-color="#eff7fc" />
          <stop offset="1" stop-color="#ffffff" />
        </linearGradient>
      </defs>
      <path d="M240 120c0 66.3-53.7 120-120 120S0 186.3 0 120 53.7 0 120 0s120 53.7 120 120z" fill="url(#tg-grad-outer)" />
      <path d="M98 175c-3.9 0-3.2-1.5-4.6-5.2L82 132.2 152.8 88l8.3 2.2-6.9 18.8L98 175z" fill="#c8daea" />
      <path d="M98 175c3 0 4.3-1.4 6-3 2.6-2.5 36-35 36-35l-20.5-5-19 12-2.5 30v1z" fill="#a9c9dd" />
      <path d="M100 144.4l48.4 35.7c5.5 3 9.5 1.5 10.9-5.1L179 82.2c2-8.1-3.1-11.7-8.4-9.3L55 117.5c-7.9 3.2-7.8 7.6-1.4 9.5l29.7 9.3L152 93c3.2-2 6.2-.9 3.8 1.3L100 144.4z" fill="url(#tg-grad-light)" />
    </svg>
  );
}

/* X (Twitter) — themed: circle uses currentColor, X uses --background */
export function XIcon(props) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <svg viewBox="-480 -466.815 2160 2160" xmlns="http://www.w3.org/2000/svg" class={local.class} aria-hidden="true" {...rest}>
      <circle cx="600" cy="613.185" r="1080" fill="currentColor" />
      <path
        d="M306.615 79.694H144.011L892.476 1150.3h162.604ZM0 0h357.328l309.814 450.883L1055.03 0h105.86L714.15 519.295 1200 1226.37H842.672L515.493 750.215 105.866 1226.37H0l468.485-544.568Z"
        style={{ fill: "hsl(var(--background))" }}
      />
    </svg>
  );
}

/* Facebook (kept as provided) */
export function FacebookIcon(props) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <svg viewBox="0 0 666.66668 666.66717" xmlns="http://www.w3.org/2000/svg" class={local.class} aria-hidden="true" {...rest}>
      <defs>
        <clipPath id="fb-clip" clipPathUnits="userSpaceOnUse">
          <path d="M 0,700 H 700 V 0 H 0 Z" />
        </clipPath>
      </defs>
      <g transform="matrix(1.3333333,0,0,-1.3333333,-133.33333,799.99999)">
        <g clip-path="url(#fb-clip)">
          <g transform="translate(600,350)">
            <path d="m 0,0 c 0,138.071 -111.929,250 -250,250 -138.071,0 -250,-111.929 -250,-250 0,-117.245 80.715,-215.622 189.606,-242.638 v 166.242 h -51.552 V 0 h 51.552 v 32.919 c 0,85.092 38.508,124.532 122.048,124.532 15.838,0 43.167,-3.105 54.347,-6.211 V 81.986 c -5.901,0.621 -16.149,0.932 -28.882,0.932 -40.993,0 -56.832,-15.528 -56.832,-55.9 V 0 h 81.659 l -14.028,-76.396 h -67.631 V -248.169 C -95.927,-233.218 0,-127.818 0,0" style={{ fill: "#0866ff" }} />
          </g>
          <g transform="translate(447.9175,273.6036)">
            <path d="M 0,0 14.029,76.396 H -67.63v 27.019 c 0,40.372 15.838,55.899 56.831,55.899 12.733,0 22.981,-0.31 28.882,-0.931 v 69.253 c -11.18,3.106 -38.509,6.212 -54.347,6.212 -83.539,0 -122.048,-39.441 -122.048,-124.533 V 76.396 h -51.552 V 0 h 51.552 v -166.242 c 19.343,-4.798 39.568,-7.362 60.394,-7.362 10.254,0 20.358,0.632 30.288,1.831 L -67.63,0 Z" style={{ fill: "#ffffff" }} />
          </g>
        </g>
      </g>
    </svg>
  );
}

/* YouTube — themed: red/brand replaced by theme (currentColor), play triangle uses --background */
export function YouTubeIcon(props) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class={local.class} aria-hidden="true" {...rest}>
      {/* Rounded rectangle (player) */}
      <rect x="3" y="7" width="18" height="10" rx="2.5" ry="2.5" fill="currentColor" />
      {/* Play triangle */}
      <path d="M10 9.5L15 12l-5 2.5z" style={{ fill: "hsl(var(--background))" }} />
    </svg>
  );
}

export default { TelegramIcon, XIcon, FacebookIcon, YouTubeIcon };
