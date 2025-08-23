// src/dev/FishIconTest.jsx
import { For } from 'solid-js';
import {
  ClamIcon,
  ShrimpIcon,
  SeahorseIcon,
  FishIcon,
  DolphinIcon,
  SharkIcon,
  StingrayIcon,
  OrcaIcon,
  WhaleIcon,
} from '../components/ui/icons/FishIcons.jsx';

const ALL_ICONS = [
  { name: 'Clam', Comp: ClamIcon },
  { name: 'Shrimp', Comp: ShrimpIcon },
  { name: 'Seahorse', Comp: SeahorseIcon },
  { name: 'Fish', Comp: FishIcon },
  { name: 'Dolphin', Comp: DolphinIcon },
  { name: 'Shark', Comp: SharkIcon },
  { name: 'Stingray', Comp: StingrayIcon },
  { name: 'Orca', Comp: OrcaIcon },
  { name: 'Whale', Comp: WhaleIcon },
];

export default function FishIconTest() {
  return (
    <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
      <h3 class="text-lg font-medium">Icon Sizing Test</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">Each icon below should be 40x40px (w-10 h-10).</p>
      <div class="flex flex-wrap items-center gap-4 p-4 border border-dashed border-[hsl(var(--border))] rounded-md">
        <For each={ALL_ICONS}>
          {(item) => {
            const Icon = item.Comp;
            return (
              <div class="flex flex-col items-center gap-1">
                <Icon class="w-10 h-10 text-sky-500" />
                <span class="text-xs">{item.name}</span>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}