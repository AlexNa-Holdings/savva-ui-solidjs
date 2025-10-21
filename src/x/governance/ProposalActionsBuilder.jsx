// src/x/governance/ProposalActionsBuilder.jsx
import { For, Show, createSignal, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { CONFIG_PARAMS } from "./proposalActionsParser.js";
import TokenValue from "../ui/TokenValue.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import AddressInput from "../ui/AddressInput.jsx";

/**
 * Component for building proposal actions (Config parameter changes)
 */
export default function ProposalActionsBuilder(props) {
  const app = useApp();
  const { t } = app;

  const [selectedParam, setSelectedParam] = createSignal("");
  const [newValue, setNewValue] = createSignal("");

  // Get list of all Config parameters
  const availableParams = createMemo(() => {
    return Object.entries(CONFIG_PARAMS)
      .map(([key, config]) => ({
        key,
        label: config.label,
        type: config.type,
        format: config.format,
        description: config.description,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  // Get currently selected parameter config
  const selectedParamConfig = createMemo(() => {
    const param = selectedParam();
    if (!param) return null;
    return CONFIG_PARAMS[param];
  });

  /**
   * Fetch current value for selected parameter
   */
  const fetchCurrentValue = async (paramName) => {
    if (!paramName) return;

    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const { toHex, formatUnits } = await import("viem");

      const config = await getSavvaContract(app, "Config", { read: true });
      const keyBytes32 = toHex(paramName, { size: 32 });
      const paramConfig = CONFIG_PARAMS[paramName];

      if (paramConfig.type === "uint") {
        const currentValue = await config.read.getUInt([keyBytes32]);

        // Format based on parameter type
        if (paramConfig.format === "token") {
          const formatted = formatUnits(currentValue, 18);
          setNewValue(formatted);
        } else if (paramConfig.format === "percent100") {
          const percent = Number(currentValue) / 100;
          setNewValue(String(percent));
        } else if (paramConfig.format === "duration") {
          setNewValue(String(currentValue));
        } else {
          setNewValue(String(currentValue));
        }
      } else if (paramConfig.type === "address") {
        const currentValue = await config.read.getAddr([keyBytes32]);
        setNewValue(currentValue);
      } else if (paramConfig.type === "bytes32") {
        const currentValue = await config.read.get([keyBytes32]);
        setNewValue(currentValue);
      }
    } catch (error) {
      console.error("Failed to fetch current value:", error);
      // Don't show error to user, just leave input empty
    }
  };

  /**
   * Add action to the list
   */
  const handleAddAction = async () => {
    if (!selectedParam() || !newValue()) return;

    try {
      const { toHex, encodeFunctionData } = await import("viem");
      const ConfigAbi = (await import("../../blockchain/abi/Config.json")).default;

      const paramConfig = selectedParamConfig();
      const keyBytes32 = toHex(selectedParam(), { size: 32 });

      let calldata;
      let displayValue = newValue();

      // Encode based on parameter type
      if (paramConfig.type === "uint") {
        // For token amounts, parse from ether
        let valueBigInt;
        if (paramConfig.format === "token") {
          const { parseEther } = await import("viem");
          valueBigInt = parseEther(newValue());
        } else if (paramConfig.format === "percent100") {
          // Multiply by 100 (e.g., 5.5% -> 550)
          valueBigInt = BigInt(Math.floor(parseFloat(newValue()) * 100));
        } else if (paramConfig.format === "duration") {
          // Duration is in seconds
          valueBigInt = BigInt(newValue());
        } else {
          valueBigInt = BigInt(newValue());
        }

        calldata = encodeFunctionData({
          abi: ConfigAbi,
          functionName: "setUInt",
          args: [keyBytes32, valueBigInt],
        });
      } else if (paramConfig.type === "address") {
        calldata = encodeFunctionData({
          abi: ConfigAbi,
          functionName: "setAddr",
          args: [keyBytes32, newValue()],
        });
      } else if (paramConfig.type === "bytes32") {
        const valueBytes32 = toHex(newValue(), { size: 32 });
        calldata = encodeFunctionData({
          abi: ConfigAbi,
          functionName: "set",
          args: [keyBytes32, valueBytes32],
        });
      }

      // Get Config contract address
      const configAddress = app.info()?.savva_contracts?.Config?.address;

      const action = {
        target: configAddress,
        value: "0",
        calldata,
        display: {
          paramName: selectedParam(),
          paramLabel: paramConfig.label,
          newValue: displayValue,
          format: paramConfig.format,
          tokenSymbol: paramConfig.tokenSymbol,
        },
      };

      props.onAdd?.(action);

      // Reset form
      setSelectedParam("");
      setNewValue("");
    } catch (error) {
      console.error("Failed to add action:", error);
      const { pushErrorToast } = await import("../../ui/toast.js");
      pushErrorToast(error, { message: t("governance.addActionFailed") });
    }
  };

  /**
   * Remove action from list
   */
  const handleRemoveAction = (index) => {
    props.onRemove?.(index);
  };

  /**
   * Format value for display
   */
  function FormattedValue(props) {
    const format = () => props.format;
    const value = () => props.value;
    const tokenSymbol = () => props.tokenSymbol || "SAVVA";

    return (
      <>
        <Show when={format() === "token"}>
          <span>{value()} {tokenSymbol()}</span>
        </Show>
        <Show when={format() === "percent100"}>
          <span>{value()}%</span>
        </Show>
        <Show when={format() === "duration"}>
          <span>{value()} {t("governance.seconds")}</span>
        </Show>
        <Show when={!format() || (format() !== "token" && format() !== "percent100" && format() !== "duration")}>
          <span>{value()}</span>
        </Show>
      </>
    );
  }

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">{t("governance.proposalActions")}</h3>

      {/* Actions List */}
      <Show when={props.actions && props.actions.length > 0}>
        <div class="space-y-2 mb-4">
          <For each={props.actions}>
            {(action, index) => (
              <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="font-medium">{action.display.paramLabel}</div>
                  <div class="text-sm text-muted-foreground">
                    {t("governance.newValue")}: <span class="font-semibold">
                      <FormattedValue
                        value={action.display.newValue}
                        format={action.display.format}
                        tokenSymbol={action.display.tokenSymbol}
                      />
                    </span>
                  </div>
                </div>
                <button
                  class="px-2 py-1 rounded text-sm hover:bg-[hsl(var(--accent))]"
                  onClick={() => handleRemoveAction(index())}
                  aria-label="Remove action"
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Add Action Form */}
      <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] space-y-3">
        <label class="block text-sm font-medium">
          {t("governance.selectParameter")}
        </label>

        {/* Parameter Selector */}
        <select
          class="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          value={selectedParam()}
          onChange={(e) => {
            const param = e.target.value;
            setSelectedParam(param);
            if (param) {
              fetchCurrentValue(param);
            } else {
              setNewValue("");
            }
          }}
        >
          <option value="">{t("governance.selectParameterPlaceholder")}</option>
          <For each={availableParams()}>
            {(param) => (
              <option value={param.key}>{param.label}</option>
            )}
          </For>
        </select>

        {/* Parameter Description */}
        <Show when={selectedParamConfig()}>
          <p class="text-sm text-muted-foreground">
            {selectedParamConfig().description}
          </p>
        </Show>

        {/* Value Input */}
        <Show when={selectedParam()}>
          <div>
            <label class="block text-sm font-medium mb-2">
              {t("governance.newValue")}
            </label>

            <Show
              when={selectedParamConfig()?.type === "address"}
              fallback={
                <input
                  type="text"
                  class="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  value={newValue()}
                  onInput={(e) => setNewValue(e.target.value)}
                  placeholder={
                    selectedParamConfig()?.format === "token" ? "0.0" :
                    selectedParamConfig()?.format === "percent100" ? "5.5" :
                    selectedParamConfig()?.format === "duration" ? "86400" :
                    "0"
                  }
                />
              }
            >
              <AddressInput
                value={newValue()}
                onChange={setNewValue}
                placeholder={t("common.addressPlaceholder")}
                label=""
              />
            </Show>
          </div>
        </Show>

        {/* Add Button */}
        <button
          class="w-full px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleAddAction}
          disabled={!selectedParam() || !newValue()}
        >
          {t("governance.addAction")}
        </button>
      </div>
    </div>
  );
}
