interface ModelSelectorProps {
    selectedProviderId: string;
    selectedModelId: string;
    onSelect: (providerId: string, modelId: string) => void;
}
export declare function ModelSelector({ selectedProviderId, selectedModelId, onSelect, }: ModelSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
