import { createSignal, onMount, Show } from "solid-js";
import Header from "./components/Header";
import RightPane from "./components/RightPane";
import Settings from "./pages/Settings";
import { useHashRouter } from "./routing/hashRouter"; // ← add

export default function App() {
  const [isPaneOpen, setIsPaneOpen] = createSignal(false);
  const { route } = useHashRouter(); // ← add

  onMount(() => {
    const handleKeydown = (e) => { if (e.key === "Escape") setIsPaneOpen(false); };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  const togglePane = () => setIsPaneOpen(!isPaneOpen());

  return (
    <div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <Header onTogglePane={togglePane} />
      <RightPane isOpen={isPaneOpen} onClose={togglePane} />

      <Show when={route() === "/settings"} fallback={
        <main class="p-4 max-w-7xl mx-auto">
          <h2 class="text-xl">Hello, Alex 👋</h2>
          <div class="card bg-white dark:bg-gray-800 p-6 rounded shadow">
            <p>Tailwind works?</p>
            <p>Right Pane Open: {isPaneOpen() ? "Yes" : "No"}</p>
            <p>Theme: {RightPane.theme ? (RightPane.theme() === "dark" ? "Dark" : "Light") : "Light"}</p>
          </div>
        </main>
      }>
        <Settings />
      </Show>
    </div>
  );
}
