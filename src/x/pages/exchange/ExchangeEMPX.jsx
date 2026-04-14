// src/x/pages/exchange/ExchangeEMPX.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";

// Our EMPX integrator ID (used for revenue sharing).
// See: https://docs.empx.io/docs/developers/widget-integration/
const EMPX_INTEGRATOR_ID =
  "0x80a23ab11cbd3b5b8d9df06c6604d4bbd5aeb9bd5c099049dca801d61c960da1";

// Map our internal chain ids to the EMPX widget's `chain` param.
function chainParamFor(chainId) {
  switch (chainId) {
    case 369:
    case 943:
      return "pulsechain";
    case 143:
    case 10143:
      return "monad";
    default:
      return null;
  }
}

export default function ExchangeEMPX() {
  const app = useApp();

  const widgetSrc = createMemo(() => {
    const chain = chainParamFor(app.desiredChain()?.id);
    const params = new URLSearchParams({
      integratorId: EMPX_INTEGRATOR_ID,
      primaryColor: "#e49c01",
      background: "#000000",
    });
    if (chain) params.set("chain", chain);
    return `https://widget.empx.io/?${params.toString()}`;
  });

  return (
    <section class="flex justify-center">
      <iframe
        src={widgetSrc()}
        allow="clipboard-read; clipboard-write"
        width="450"
        height="900"
        frameborder="0"
        class="max-w-full rounded-lg border border-[hsl(var(--border))]"
        title="EMPX Exchange"
      />
    </section>
  );
}
