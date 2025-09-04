// src/x/main/ConnectionError.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function ConnectionError(props) {
  const { t } = useApp();

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div class="fixed inset-0 flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-4">
      <div class="w-full max-w-md p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] text-center shadow-lg">
        <h2 class="text-xl font-semibold mb-3">{t("error.connection.title")}</h2>
        <p class="mb-4 text-[hsl(var(--muted-foreground))]">
          {t("error.connection.message")}
        </p>
        <Show when={props.error}>
          <pre class="mb-4 p-2 text-xs text-left bg-[hsl(var(--muted))] rounded overflow-x-auto">
            {props.error.message || props.error.toString()}
          </pre>
        </Show>
        <button
          class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
          onClick={handleRetry}
        >
          {t("error.connection.retry")}
        </button>
      </div>
    </div>
  );
}