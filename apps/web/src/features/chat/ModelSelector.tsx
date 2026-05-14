import { ChevronDown } from "lucide-react";
import { useProviderStore } from "@/store/providerStore";
import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  selectedProviderId: string;
  selectedModelId: string;
  onSelect: (providerId: string, modelId: string) => void;
}

export function ModelSelector({
  selectedProviderId,
  selectedModelId,
  onSelect,
}: ModelSelectorProps) {
  const providers = useProviderStore((s) => s.providers);
  const models = useMemo(
    () =>
      providers
        .filter((p) => p.enabled)
        .flatMap((p) =>
          p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name })),
        ),
    [providers],
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = models.find(
    (m) => m.providerId === selectedProviderId && m.id === selectedModelId,
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Group by provider
  const grouped = models.reduce<
    Record<string, { name: string; models: typeof models }>
  >((acc, m) => {
    if (!acc[m.providerId]) {
      acc[m.providerId] = { name: m.providerName, models: [] };
    }
    acc[m.providerId]!.models.push(m);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
      >
        {selected ? (
          <>
            <span>{selected.name}</span>
            <span className="text-muted-foreground text-[10px]">
              ({selected.providerName})
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Select model</span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <div className="max-h-80 overflow-y-auto py-1">
            {Object.entries(grouped).map(([providerId, group]) => (
              <div key={providerId}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </div>
                {group.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelect(providerId, model.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                      selectedProviderId === providerId &&
                        selectedModelId === model.id &&
                        "bg-accent",
                    )}
                  >
                    <span>{model.name}</span>
                    <div className="flex gap-1 shrink-0">
                      {model.supportsVision && (
                        <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1">
                          vision
                        </span>
                      )}
                      {model.isLocal && (
                        <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 rounded px-1">
                          local
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}

            {models.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No providers enabled. Configure them in Settings.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
