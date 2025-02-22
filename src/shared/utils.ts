export const isBrowser = typeof window !== 'undefined';

export class BrowserFeatures {
    static get hasEventSource(): boolean {
        return isBrowser && 'EventSource' in window;
    }

    static get hasLocalStorage(): boolean {
        return isBrowser && 'localStorage' in window;
    }
}

export const WELSH = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';

export const subnetTokens = {
    [WELSH]: 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token::welshcorgicoin'
};

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