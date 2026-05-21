interface Toast {
    id: string;
    title: string;
    description?: string;
    variant?: "default" | "destructive";
}
export declare function toast(t: Omit<Toast, "id">): void;
export declare namespace toast {
    var success: (title: string, description?: string) => void;
    var error: (title: string, description?: string) => void;
}
export declare function Toaster(): import("react/jsx-runtime").JSX.Element;
export {};
