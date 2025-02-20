export const isBrowser = typeof window !== 'undefined';

export class BrowserFeatures {
    static get hasEventSource(): boolean {
        return isBrowser && 'EventSource' in window;
    }

    static get hasLocalStorage(): boolean {
        return isBrowser && 'localStorage' in window;
    }
}

export class MockEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;

    readyState = MockEventSource.CLOSED;
    onmessage: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;

    constructor() {
        console.warn('EventSource is not available in this environment');
    }

    close() {
        this.readyState = MockEventSource.CLOSED;
    }
} 