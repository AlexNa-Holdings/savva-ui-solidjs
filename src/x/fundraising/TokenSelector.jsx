// src/x/fundraising/TokenSelector.jsx
import { For } from "solid-js";

const TokenButton = (props) => {
  const Icon = () => props.token.Icon;
  return (
    <button
      type="button"
      onClick={() => props.onClick(props.token.address)}
      class="flex flex-col items-center gap-1 p-1 rounded-lg border w-20 h-20 justify-center transition-colors"
      classList={{
        "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]": props.isSelected,
        "bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]": !props.isSelected,
      }}
    >
      <Icon class="w-12 h-12" />
      <span class="text-xs font-semibold">{props.token.symbol}</span>
    </button>
  );
};

export default function TokenSelector(props) {
  return (
    <div>
      <span class="text-sm font-medium">{props.label}</span>
      <div class="mt-1 flex flex-wrap gap-2 justify-center">
        <For each={props.tokens}>
          {(token) => (
            <TokenButton 
              token={token}
              isSelected={props.selectedValue === token.address}
              onClick={props.onChange}
            />
          )}
        </For>
      </div>
    </div>
  );
}