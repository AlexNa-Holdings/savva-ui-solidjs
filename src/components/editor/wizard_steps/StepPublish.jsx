// src/components/editor/wizard_steps/StepPublish.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { getSavvaContract } from "../../../blockchain/contracts.js";
import { toHexBytes32 } from "../../../blockchain/utils.js";
import { dbg } from "../../../utils/debug.js";
import { createPublicClient, http } from "viem";

function parseViemError(e) {
  if (e?.shortMessage) {
    return e.shortMessage;
  }
  if (e?.message?.includes('User rejected the request')) {
    return 'User rejected the request.';
  }
  if (e?.name === 'TransactionExecutionError' && e.cause?.shortMessage) {
    return e.cause.shortMessage;
  }
  return e.message;
}

export default function StepPublish(props) {
  const app = useApp();
  const { t } = app;
  const [error, setError] = createSignal(null);
  const [status, setStatus] = createSignal("waiting_signature");
  const [txHash, setTxHash] = createSignal(null);

  const attemptPublish = async () => {
    setError(null);
    setTxHash(null);
    setStatus("waiting_signature");

    try {
      const { postParams, publishedData, editorMode } = props;
      const user = app.authorizedUser();
      const domain = app.selectedDomainName();
      const descriptorCid = publishedData().descriptorCid;
      const guid = postParams().guid;

      if (!user?.address || !domain || !descriptorCid || !guid) {
        throw new Error("Missing required data for publishing (user, domain, descriptorCid, or guid).");
      }

      let contentType;
      if (editorMode === 'new_post') {
        contentType = 'post';
      } else { // edit_post mode
        contentType = postParams().publishAsNewPost ? 'post' : 'post-edit';
      }
      
      dbg.log("StepPublish", "Publishing with params:", { domain, author: user.address, guid, ipfs: descriptorCid, contentType });

      const contract = await getSavvaContract(app, "ContentRegistry", { write: true });
      
      const hash = await contract.write.reg([
        domain,
        user.address,
        guid,
        descriptorCid,
        toHexBytes32(contentType)
      ]);

      setStatus("publishing");
      setTxHash(hash);
      dbg.log("StepPublish", "Transaction sent, hash:", hash);

      const desiredChain = app.desiredChain();
      if (!desiredChain?.rpcUrls?.[0]) {
        throw new Error("RPC URL for the desired chain is not configured.");
      }
      const transport = http(desiredChain.rpcUrls[0]);
      const publicClient = createPublicClient({ chain: desiredChain, transport: transport });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      dbg.log("StepPublish", "Transaction confirmed:", receipt);
      props.onComplete?.();
    } catch (e) {
      dbg.error("StepPublish", "Publishing failed:", e);
      setError(parseViemError(e));
    }
  };

  onMount(() => {
    setTimeout(attemptPublish, 500);
  });

  return (
    <div class="flex flex-col items-center justify-center h-full text-center p-4">
      <Show when={!error()}
        fallback={
          <>
            <h4 class="font-bold text-red-600">{t("editor.publish.publishing.errorTitle")}</h4>
            <p class="mt-2 text-sm break-all">{error()}</p>
            <div class="mt-4 flex gap-2 justify-center">
              <button onClick={props.onCancel} class="px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
                {t("editor.publish.validation.backToEditor")}
              </button>
              <button onClick={attemptPublish} class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                {t("common.retry")}
              </button>
            </div>
          </>
        }
      >
        <Spinner />
        <Show when={status() === 'waiting_signature'}>
            <p class="mt-2 text-sm font-semibold">{t("editor.publish.publishing.waitSignature")}</p>
            <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))] max-w-sm">
              {t("editor.publish.publishing.waitSignatureHelp")}
            </p>
        </Show>
         <Show when={status() === 'publishing'}>
            <p class="mt-2 text-sm">{t("editor.publish.publishing.waitFinalize")}</p>
        </Show>
        <Show when={txHash()}>
          <div class="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            <p>{t("editor.publish.publishing.txHash")}:</p>
            <a href={`${app.desiredChain().blockExplorers[0]}/tx/${txHash()}`} target="_blank" class="font-mono break-all underline">
              {txHash()}
            </a>
          </div>
        </Show>
      </Show>
    </div>
  );
}