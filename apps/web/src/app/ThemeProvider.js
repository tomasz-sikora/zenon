import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState, } from "react";
const ThemeContext = createContext(null);
const STORAGE_KEY = "zenon-theme";
function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}
export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "system");
    const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(resolvedTheme);
    }, [resolvedTheme]);
    useEffect(() => {
        if (theme !== "system")
            return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
            document.documentElement.classList.remove("light", "dark");
            document.documentElement.classList.add(getSystemTheme());
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme]);
    const setTheme = (t) => {
        localStorage.setItem(STORAGE_KEY, t);
        setThemeState(t);
    };
    return (_jsx(ThemeContext.Provider, { value: { theme, resolvedTheme, setTheme }, children: children }));
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx)
        throw new Error("useTheme must be used within ThemeProvider");
    return ctx;
}
