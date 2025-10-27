// src/x/modals/ConnectTelegramModal.jsx
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import Spinner from "../ui/Spinner.jsx";
import Countdown from "../ui/Countdown.jsx";
import QRCode from "qrcode";

function QRCanvas(props) {
  let canvasRef;
  createEffect(async () => {
    const txt = props.text;
    if (!canvasRef || !txt) return;
    try {
      await QRCode.toCanvas(canvasRef, txt, { width: 240, margin: 1 });
    } catch {}
  });
  return <canvas ref={canvasRef} width="240" height="240" class="rounded-sm border border-[hsl(var(--border))]" />;
}

export default function ConnectTelegramModal(props) {
  const app = useApp();
  const { t } = app;
  const isOpen = () => !!(props.isOpen ?? props.open);

  const [token, setToken] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [expiresAtSec, setExpiresAtSec] = createSignal(0);

  async function callWs(method, params) {
    if (typeof app.wsCall === "function") return app.wsCall(method, params);
    const api = app.wsApi?.();
    if (api && typeof api.call === "function") return api.call(method, params);
    throw new Error("WS API unavailable");
  }

  // Fetch one-time auth token when opened
  createEffect(() => {
    if (!isOpen()) return;
    setToken("");
    setError(null);
    setLoading(true);
    setExpiresAtSec(0);

    callWs("temp-auth-token", {})
      .then((res) => {
        const tok = res?.token ? String(res.token) : "";
        if (!tok) throw new Error("no token");
        setToken(tok);
        setExpiresAtSec(Math.floor(Date.now() / 1000) + 2 * 60);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  });

  // Resolve Telegram bot for current domain
  const botName = createMemo(() => {
    const current = (app.selectedDomainName?.() || app.domain?.() || "").toLowerCase();
    const direct = app.domainInfo?.()?.telegram_bot;
    if (direct) return direct || "SavvaAppBot";
    const info = app.info?.();
    const arr = Array.isArray(info?.domains) ? info.domains : [];
    const found = arr.find((d) => (d?.name || "").toLowerCase() === current);
    return found?.telegram_bot || "SavvaAppBot";
  });

  const deepLink = createMemo(() => {
    const tok = token();
    if (!tok) return "";
    const lang = app.lang?.() || "en";
    return `https://t.me/${botName()}?start=${tok}-${lang}`;
  });

  return (
    <Modal
      isOpen={isOpen()}
      onClose={props.onClose}
      title={t("telegram.connect.title")}
      size="md"
      footer={
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
            onClick={props.onClose}
          >
            {t("common.cancel")}
          </button>
        </div>
      }
    >
      <p class="text-sm opacity-80 mb-3">{t("telegram.connect.subtitle")}</p>

      <Show when={error()}>
        <div class="text-sm text-[hsl(var(--destructive))] mb-3">
          {t("telegram.connect.error")}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Show>

      <Show when={!loading() && token()}>
        <div class="flex flex-col items-center gap-3">
          <QRCanvas text={deepLink()} />
          <a
            href={deepLink()}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium hover:underline text-[hsl(var(--primary))]"
          >
            {t("telegram.connect.openInApp")}
          </a>

          <div class="text-xs opacity-70 flex items-center gap-2">
            <span>{t("telegram.connect.expiresIn")}</span>
            <Countdown
              targetTs={expiresAtSec()}
              size="sm"
              labelStyle="short"
              labelPosition="side"
              anim="reverse"
              onDone={props.onClose}
            />
          </div>
        </div>
      </Show>
    </Modal>
  );
}
