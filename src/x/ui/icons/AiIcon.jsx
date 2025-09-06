// src/components/icons/AiIcon.jsx
import { splitProps } from "solid-js";

export default function AiIcon(props) {
  const [local, rest] = splitProps(props, ["size", "strokeWidth", "class"]);
  const size = local.size ?? 20;
  const sw = local.strokeWidth ?? 2;

  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width={sw}
      class={local.class}
      aria-hidden="true"
      {...rest}
    >
      <g>
        <circle cx="34.52" cy="11.43" r="5.82"></circle>
        <circle cx="53.63" cy="31.6" r="5.82"></circle>
        <circle cx="34.52" cy="50.57" r="5.82"></circle>
        <circle cx="15.16" cy="42.03" r="5.82"></circle>
        <circle cx="15.16" cy="19.27" r="5.82"></circle>
        <circle cx="34.51" cy="29.27" r="4.7"></circle>
        <line x1="20.17" y1="16.3" x2="28.9" y2="12.93"></line>
        <line x1="38.6" y1="15.59" x2="49.48" y2="27.52"></line>
        <line x1="50.07" y1="36.2" x2="38.67" y2="46.49"></line>
        <line x1="18.36" y1="24.13" x2="30.91" y2="46.01"></line>
        <line x1="20.31" y1="44.74" x2="28.7" y2="48.63"></line>
        <line x1="17.34" y1="36.63" x2="31.37" y2="16.32"></line>
        <line x1="20.52" y1="21.55" x2="30.34" y2="27.1"></line>
        <line x1="39.22" y1="29.8" x2="47.81" y2="30.45"></line>
        <line x1="34.51" y1="33.98" x2="34.52" y2="44.74"></line>
      </g>
    </svg>
  );
}
