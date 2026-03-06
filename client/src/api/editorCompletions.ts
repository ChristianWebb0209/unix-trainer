/**
 * Editor completion data from GET /api/editor-completions/:language.
 * Used only by CodeEditorPane for IntelliSense; editor works without it until loaded.
 */

export interface CompletionItem {
    label: string;
    type?: "keyword" | "function" | "variable" | "text";
    detail?: string;
    info?: string;
    docUrl?: string;
}

export interface EditorCompletionData {
    docBaseUrl?: string;
    keywords?: CompletionItem[];
    builtins?: CompletionItem[];
    variables?: CompletionItem[];
}

const cache = new Map<string, EditorCompletionData>();

function getBaseUrl(): string {
    if (typeof window === "undefined") return "";
    return window.location.origin;
}

/**
 * Fetch completion data for a language. Results are cached in memory per session.
 * Returns null if the language has no completion file (404) or on error.
 */
export async function fetchEditorCompletions(language: string): Promise<EditorCompletionData | null> {
    const lang = language.toLowerCase();
    const cached = cache.get(lang);
    if (cached !== undefined) return cached;

    try {
        const res = await fetch(`${getBaseUrl()}/api/editor-completions/${lang}`);
        if (!res.ok) return null;
        const data = (await res.json()) as EditorCompletionData;
        if (!data || typeof data !== "object") return null;
        cache.set(lang, data);
        return data;
    } catch {
        return null;
    }
}
