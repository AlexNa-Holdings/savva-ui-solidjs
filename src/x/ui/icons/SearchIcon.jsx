// src/x/ui/icons/SearchIcon.jsx
import { splitProps } from "solid-js";

export default function SearchIcon(props) {
  const [local, rest] = splitProps(props, ["class", "size", "strokeWidth"]);
  const size = () => local.size ?? 24;
  const sw = () => local.strokeWidth ?? 2;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size()}
      height={size()}
      class={local.class}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <path
        d="M11 6C13.7614 6 16 8.23858 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"
        stroke="currentColor"
        stroke-width={sw()}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
