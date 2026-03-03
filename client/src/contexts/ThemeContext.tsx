import { createContext } from "react";
import type { ReactNode } from "react";

type Theme = "dark";

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
    theme: "dark",
    toggleTheme: () => { },
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    return (
        <ThemeContext.Provider value={{ theme: "dark", toggleTheme: () => { } }}>
            {children}
        </ThemeContext.Provider>
    );
};
