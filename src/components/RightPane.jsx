// src/components/RightPane.jsx
import { createEffect } from "solid-js";
import { useTheme } from "../hooks/useTheme";

export default function RightPane({ isOpen, onClose }) {
  const [theme, toggleTheme] = useTheme();

  createEffect(() => {
    console.log("RightPane: isOpen changed to:", isOpen()); // Debug reactivity
  });

  const handlePanelClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose(); // Close only if clicking the panel's outer edge
    }
  };

  // Pass theme to parent (App.jsx) via a prop or context
  RightPane.theme = theme; // Attach theme signal to RightPane for App.jsx access

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg z-30 ${
          isOpen() ? "right-0" : "right-[-256px]"
        } transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
      >
        <div class="p-4">
          <button
            class="mb-4 p-2 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <ul class="space-y-2">
            <li>
              <button
                onClick={() => {
                  toggleTheme();
                  console.log("Theme toggled, new theme:", theme()); // Debug log
                }}
                class="w-full text-left px-4 py-2 bg-blue-500 dark:bg-blue-700 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-800 transition"
              >
                {theme() === "dark" ? "Dark" : "Light"} mode
                <span class="ml-2">{theme() === "dark" ? "🌙" : "☀️"}</span>
              </button>
            </li>
            <li>
              <button class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                Option 1
              </button>
            </li>
            <li>
              <button class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                Option 2
              </button>
            </li>
            <li>
              <button class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                Option 3
              </button>
            </li>
          </ul>
        </div>
      </div>
      {isOpen() && (
        <div
          class="fixed inset-0 bg-black opacity-20 z-20"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }} // Fallback inline style
          data-testid="overlay"
        ></div>
      )}
    </>
  );
}