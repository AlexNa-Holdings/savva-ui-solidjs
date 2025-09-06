// src/x/editor/wizard_steps/StepPublish.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { toHexBytes32 } from "../../../blockchain/utils.js";
import { sendAsActor } from "../../../blockchain/npoMulticall.js";


function parseViemError(e) {
  if (e?.shortMessage) return e.shortMessage;
  if (e?.message?.includes("User rejected")) return "User rejected the request.";
  if (e?.name === "TransactionExecutionError" && e.cause?.shortMessage) return e.cause.shortMessage;
  return e?.message || String(e || "Unknown error");
}

export default function StepPublish(props) {
  const app = useApp();
  const { t } = app;

  const [error, setError] = createSignal(null);
  const [status, setStatus] = createSignal("waiting_signature");
  const [txHash, setTxHash] = createSignal(null);

  const cleanCid = (s) => String(s || "").replace(/^\.\/?/, ""); // strip leading "." or "./"

  const attemptPublish = async () => {
    setError(null);
    setTxHash(null);
    setStatus("waiting_signature");

    try {
      const domain = app.selectedDomainName?.();
      const descriptorCid = cleanCid(props.publishedData()?.descriptorCid);
      const guid = props.postParams()?.guid;

      const actorAddr = app.actorAddress?.();

      let contentType;
      switch (props.editorMode) {
        case "new_post": contentType = "post"; break;
        case "edit_post": contentType = props.postParams()?.publishAsNewPost ? "post" : "post-edit"; break;
        case "new_comment": contentType = "comment"; break;
        case "edit_comment": contentType = "comment-edit"; break;
        default: throw new Error(`Unknown editor mode: ${props.editorMode}`);
      }

      const receipt = await sendAsActor(app, {
        contractName: "ContentRegistry",
        functionName: "reg",
        args: [domain, actorAddr, guid, descriptorCid, toHexBytes32(contentType)],
      });

      setStatus("publishing");
      try { setTxHash(receipt?.transactionHash || null); } catch { }

      props.onComplete?.();
    } catch (e) {
      setError(parseViemError(e));
    }
  };

  onMount(() => { setTimeout(attemptPublish, 60); });

  return (
    <div class="flex flex-col items-center justify-center h-full text-center p-4">
      <Show when={!error()} fallback={
        <>
          <h4 class="font-bold text-red-600">{t("editor.publish.publishing.errorTitle")}</h4>
          <p class="mt-2 text-sm break-all">{error()}</p>
          <div class="mt-4 flex gap-2 justify-center">
            <button onClick={props.onCancel} class="px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
              {t("editor.publish.validation.backToEditor")}
            </button>
            <button onClick={props.onRetry} class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
              {t("common.retry")}
            </button>
          </div>
        </>
      }>
        <Spinner />
        <Show when={status() === "waiting_signature"}>
          <p class="mt-2 text-sm font-semibold">{t("editor.publish.publishing.waitSignature")}</p>
          <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))] max-w-sm">
            {t("editor.publish.publishing.waitSignatureHelp")}
          </p>
        </Show>
        <Show when={status() === "publishing"}>
          <p class="mt-2 text-sm">{t("editor.publish.publishing.waitFinalize")}</p>
        </Show>
        <Show when={txHash()}>
          <div class="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            <p>{t("editor.publish.publishing.txHash")}:</p>
            <a
              href={`${app.desiredChain().blockExplorers?.[0] || app.desiredChain().blockExplorers?.default?.url}/tx/${txHash()}`}
              target="_blank"
              class="font-mono break-all underline"
            >
              {txHash()}
            </a>
          </div>
        </Show>
      </Show>
    </div>
  );
}
