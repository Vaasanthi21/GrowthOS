export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

export const REFINE_SESSION_STORAGE_KEY = 'creative_studio_refine_session';
const MAX_REFINEMENT_MESSAGES = 12;
const MAX_MESSAGE_CONTENT_LENGTH = 4000;

export function buildConversationKey(parts: Array<unknown>) {
    return parts
        .map((part) => String(part ?? '').trim().toLowerCase())
        .filter(Boolean)
        .join('::');
}

function trimMessage(message: any) {
    if (!message || typeof message !== 'object') {
        return message;
    }

    return {
        ...message,
        content: typeof message.content === 'string'
            ? message.content.slice(0, MAX_MESSAGE_CONTENT_LENGTH)
            : message.content,
        image_base64: null,
    };
}

function buildPersistableRefineSession(state: any) {
    if (!state || typeof state !== 'object') {
        return state;
    }

    const nextState = { ...state };

    if (Array.isArray(nextState.messages)) {
        nextState.messages = nextState.messages
            .slice(-MAX_REFINEMENT_MESSAGES)
            .map(trimMessage);
    }

    if (nextState.generatedContent && typeof nextState.generatedContent === 'object') {
        nextState.generatedContent = {
            ...nextState.generatedContent,
            image_base64: null,
            content: typeof nextState.generatedContent.content === 'string'
                ? nextState.generatedContent.content.slice(0, MAX_MESSAGE_CONTENT_LENGTH)
                : nextState.generatedContent.content,
        };
    }

    if (typeof nextState.ragContext === 'string') {
        nextState.ragContext = nextState.ragContext.slice(0, 6000);
    }

    if (typeof nextState.originalPrompt === 'string') {
        nextState.originalPrompt = nextState.originalPrompt.slice(0, 4000);
    }

    return nextState;
}

export function persistRefineSession(state: unknown) {
    if (typeof window === 'undefined' || !state) {
        return;
    }

    try {
        window.sessionStorage.setItem(REFINE_SESSION_STORAGE_KEY, JSON.stringify(buildPersistableRefineSession(state)));
    } catch (error) {
        console.warn('Failed to persist refine session:', error);
    }
}

export function restoreRefineSession<T>() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const stored = window.sessionStorage.getItem(REFINE_SESSION_STORAGE_KEY);
        return stored ? (JSON.parse(stored) as T) : null;
    } catch (error) {
        console.warn('Failed to restore refine session:', error);
        return null;
    }
}