import { STACKS_MAINNET } from '@stacks/network';
import { openStructuredDataSignatureRequestPopup, showConnect, FinishedAuthData, getOrCreateUserSession } from '@stacks/connect';
import { createBlazeDomain, createBlazeMessage } from '../shared/messages';
import { subnetTokens, WELSH } from '../shared/utils';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import type { Balance, BalanceOptions, TransferOptions, Transfer, BlazeEvent, EventType, EventSubscription, FinishedTxData } from '../types';
import { isBrowser, BrowserFeatures, MockEventSource } from '../shared/utils';
import axios from 'axios';

const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const MAX_RETRY_DELAY = 32000; // Max retry delay of 32 seconds

// Get the appropriate EventSource implementation
const EventSourceImpl = isBrowser && BrowserFeatures.hasEventSource
    ? window.EventSource
    : MockEventSource;

export class Blaze {
    subnet: string;
    tokenIdentifier: string;
    signer: string;
    nodeUrl: string;
    eventSource: InstanceType<typeof EventSourceImpl> | null = null;
    eventHandlers: Map<EventType, Set<(event: BlazeEvent) => void>> = new Map();
    lastBalance: Balance = { total: 0 };
    retryCount = 0;
    heartbeatTimeout: NodeJS.Timeout | null = null;
    lastBalanceUpdate: number = 0;
    isServerSide: boolean;

    constructor() {
        this.signer = '';
        this.nodeUrl = 'https://charisma.rocks/api/v0/blaze';
        this.isServerSide = !isBrowser;
        this.subnet = WELSH;

        this.tokenIdentifier = subnetTokens[this.subnet as keyof typeof subnetTokens];
        if (!this.tokenIdentifier) {
            throw new Error(`No token identifier found for subnet: ${this.subnet}`);
        }

        // Initialize event handlers for each event type
        ['transfer', 'deposit', 'withdraw', 'balance', 'batch'].forEach(type => {
            this.eventHandlers.set(type as EventType, new Set());
        });

        // Warn if running in server environment
        if (this.isServerSide) {
            console.warn('Blaze client was initialized in a server environment. Some features may be limited.');
        }
    }

    // Connect wallet
    public async connectWallet(): Promise<string> {
        if (getOrCreateUserSession().isUserSignedIn()) {
            return getOrCreateUserSession().loadUserData().profile.stxAddress.mainnet;
        }

        try {
            return new Promise((resolve) => {
                showConnect({
                    appDetails: {
                        name: 'Blaze Subnets',
                        icon: 'https://charisma.rocks/charisma.png',
                    },
                    onFinish: (data: FinishedAuthData) => {
                        this.signer = data.userSession.loadUserData().profile.stxAddress.mainnet;
                        resolve(data.userSession.loadUserData().profile.stxAddress.mainnet);
                    },
                    onCancel: () => {
                        resolve('');
                    },
                    userSession: undefined,
                });
            });
        } catch (error) {
            console.error('Error connecting wallet:', error);
            return '';
        }
    }

    // Disconnect wallet
    public disconnectWallet() {
        this.signer = '';
        // Clean up any existing subscriptions
        this.eventSource?.close();
        this.eventSource = null;
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
        // Reset balance
        this.lastBalance = { total: 0 };
        this.lastBalanceUpdate = 0;
    }

    // Check if wallet is connected
    public isWalletConnected(): boolean {
        return getOrCreateUserSession().isUserSignedIn()
    }

    // Get current wallet address
    public getWalletAddress(): string {
        return getOrCreateUserSession().loadUserData().profile.stxAddress.mainnet
    }

    private async connectEventSource() {
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        if (this.isServerSide) {
            console.warn('EventSource connections are not supported in server environment');
            return;
        }

        if (this.eventSource?.readyState === EventSourceImpl.OPEN) {
            return;
        }

        // Close existing connection if any
        this.eventSource?.close();
        this.eventSource = null;

        // Clear existing heartbeat timeout
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }

        const url = new URL(`${this.nodeUrl}/subnets/${this.subnet}/events`);
        url.searchParams.set('signer', this.signer);

        this.eventSource = new EventSourceImpl(url.toString());

        this.eventSource.onmessage = (event: any) => {
            try {
                if (event.data === 'heartbeat') {
                    this.handleHeartbeat();
                    return;
                }

                const blazeEvent: BlazeEvent = JSON.parse(event.data);
                this.handleEvent(blazeEvent);

                // Reset retry count on successful message
                this.retryCount = 0;
            } catch (error) {
                console.error('Error parsing event:', error);
            }
        };

        this.eventSource.onerror = (error: any) => {
            console.error('EventSource error:', error);
            this.eventSource?.close();
            this.eventSource = null;

            // Clear heartbeat timeout
            if (this.heartbeatTimeout) {
                clearTimeout(this.heartbeatTimeout);
                this.heartbeatTimeout = null;
            }

            // Attempt to reconnect with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), MAX_RETRY_DELAY);
            this.retryCount++;
            setTimeout(() => this.connectEventSource(), delay);
        };

        // Set initial heartbeat timeout
        this.resetHeartbeatTimeout();
    }

    private handleHeartbeat() {
        // Reset the heartbeat timeout
        this.resetHeartbeatTimeout();
    }

    private resetHeartbeatTimeout() {
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
        }

        this.heartbeatTimeout = setTimeout(() => {
            console.warn('Heartbeat timeout, reconnecting...');
            this.eventSource?.close();
            this.connectEventSource();
        }, HEARTBEAT_INTERVAL * 2); // Double the heartbeat interval for timeout
    }

    private handleEvent(event: BlazeEvent) {
        const handlers = this.eventHandlers.get(event.type);
        if (handlers) {
            handlers.forEach(handler => handler(event));
        }

        // Update local balance state if event contains balance info
        if (event.data.balance) {
            this.lastBalance = event.data.balance;
            this.lastBalanceUpdate = Date.now();
        }
    }

    public subscribe(type: EventType, handler: (event: BlazeEvent) => void): EventSubscription {
        const handlers = this.eventHandlers.get(type);
        if (!handlers) {
            throw new Error(`Invalid event type: ${type}`);
        }

        handlers.add(handler);
        this.connectEventSource();

        return {
            unsubscribe: () => {
                handlers.delete(handler);
                // If no more handlers for any event type, close the connection
                if ([...this.eventHandlers.values()].every(set => set.size === 0)) {
                    if (this.heartbeatTimeout) {
                        clearTimeout(this.heartbeatTimeout);
                        this.heartbeatTimeout = null;
                    }
                    this.eventSource?.close();
                    this.eventSource = null;
                }
            }
        };
    }

    async getBalance(options?: BalanceOptions): Promise<Balance> {
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }
        // If we have a recent balance update (within last 5 seconds) and it matches the requested options
        const BALANCE_FRESHNESS_MS = 5000; // 5 seconds
        const isCachedBalanceFresh = (Date.now() - this.lastBalanceUpdate) < BALANCE_FRESHNESS_MS;

        if (isCachedBalanceFresh) {
            const hasConfirmed = this.lastBalance.confirmed !== undefined;
            const hasUnconfirmed = this.lastBalance.unconfirmed !== undefined;
            const wantsConfirmed = options?.includeConfirmed ?? false;
            const wantsUnconfirmed = options?.includeUnconfirmed ?? false;

            // If we have what they want in cache, use it
            if ((!wantsConfirmed || hasConfirmed) && (!wantsUnconfirmed || hasUnconfirmed)) {
                const result: Balance = { total: this.lastBalance.total };
                if (wantsConfirmed && hasConfirmed) {
                    result.confirmed = this.lastBalance.confirmed;
                }
                if (wantsUnconfirmed && hasUnconfirmed) {
                    result.unconfirmed = this.lastBalance.unconfirmed;
                }
                return result;
            }
        }

        // Otherwise fetch from server
        const response = await axios.get(`${this.nodeUrl}/subnets/${this.subnet}/balances/${this.signer}`, {
            params: options
        });
        const balance = response.data as Balance;
        this.lastBalance = balance;
        this.lastBalanceUpdate = Date.now();
        return balance;
    }

    async transfer(options: TransferOptions) {
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        const nextNonce = Date.now();
        const tokens = options.amount;

        const domain = createBlazeDomain();
        const message = createBlazeMessage({
            to: options.to,
            amount: tokens,
            nonce: nextNonce
        });

        const result: any = await new Promise((resolve) => {
            openStructuredDataSignatureRequestPopup({
                domain,
                message,
                network: STACKS_MAINNET,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        if (!result?.signature) throw new Error('User cancelled or signing failed');
        const signature = result.signature;

        const transfer: Transfer = {
            signature,
            signer: this.signer,
            to: options.to,
            amount: tokens,
            nonce: nextNonce,
        };

        // Send transfer to server
        const response = await axios.post(`${this.nodeUrl}/subnets/${this.subnet}/xfer`, transfer);
        if (response.status !== 200) {
            throw new Error(`Transfer failed: ${response.statusText}`);
        }

        return response.data;
    }

    async deposit(amount: number) {
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        const txOptions = buildDepositTxOptions({ subnet: this.subnet, amount, signer: this.signer });

        const { showContractCall } = await import("@stacks/connect");
        const result = await new Promise<FinishedTxData | null>((resolve) => {
            showContractCall({
                ...txOptions,
                network: STACKS_MAINNET,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        if (!result?.txId) {
            throw new Error('Transaction cancelled or failed');
        }

        // Notify server about the deposit
        await axios.post(`${this.nodeUrl}/subnets/${this.subnet}/deposit`, {
            txid: result.txId,
            amount,
            signer: this.signer
        });

        return result;
    }

    async withdraw(amount: number) {
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        const txOptions = buildWithdrawTxOptions({ subnet: this.subnet, amount });

        const { showContractCall } = await import("@stacks/connect");
        const result = await new Promise<FinishedTxData | null>((resolve) => {
            showContractCall({
                ...txOptions,
                network: STACKS_MAINNET,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        if (!result?.txId) {
            throw new Error('Transaction cancelled or failed');
        }

        // Notify server about the withdrawal
        await axios.post(`${this.nodeUrl}/subnets/${this.subnet}/withdraw`, {
            txid: result.txId,
            amount,
            signer: this.signer
        });

        return result;
    }
} 