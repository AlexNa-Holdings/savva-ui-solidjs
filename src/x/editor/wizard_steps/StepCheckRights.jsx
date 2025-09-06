// src/x/editor/wizard_steps/StepCheckRights.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { getConfigParam } from "../../../blockchain/config.js";
import { getSavvaContract } from "../../../blockchain/contracts.js";
import { formatUnits } from "viem";

export default function StepCheckRights(props) {
  const app = useApp();
  const { t } = app;
  const [error, setError] = createSignal(null);
  const [isChecking, setIsChecking] = createSignal(true);

  const checkRights = async () => {
    const user = app.authorizedUser();
    const actorAddr = app.actorAddress?.() || user?.address;
    if (!actorAddr) {
      throw new Error(t("editor.publish.rights.errorNoAuth"));
    }

    const minStakeWei = await getConfigParam(app, "min_staked_to_post");
    if (minStakeWei === null) {
      throw new Error(t("editor.publish.rights.errorConfig"));
    }

    const stakingContract = await getSavvaContract(app, "Staking");
    const stakeWei = await stakingContract.read.balanceOf([actorAddr]);

    if (stakeWei < minStakeWei) {
      const required = parseFloat(formatUnits(minStakeWei, 18)).toLocaleString();
      const actual = parseFloat(formatUnits(stakeWei, 18)).toLocaleString();
      throw new Error(t("editor.publish.rights.errorInsufficientStake", { required, actual }));
    }
  };

  onMount(() => {
    setTimeout(async () => {
      try {
        await checkRights();
        props.onComplete?.();
      } catch (e) {
        setError(e.message);
      } finally {
        setIsChecking(false);
      }
    }, 500);
  });

  return (
    <div class="flex flex-col items-center justify-center h-full">
      <Show when={isChecking()}>
        <Spinner />
        <p class="mt-2 text-sm">{t("common.checking")}...</p>
      </Show>
      <Show when={error()}>
        <div class="text-center p-4">
          <h4 class="font-bold text-red-600">{t("editor.publish.rights.errorTitle")}</h4>
          <p class="mt-2 text-sm">{error()}</p>
          <button onClick={props.onCancel} class="mt-4 px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
            {t("editor.publish.validation.backToEditor")}
          </button>
        </div>
      </Show>
    </div>
  );
}
