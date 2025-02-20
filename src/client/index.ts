import { STACKS_MAINNET } from '@stacks/network';
import { showSignStructuredMessage, showConnect, FinishedAuthData } from '@stacks/connect';
import { createBlazeDomain, createBlazeMessage } from '../shared/structured-data';
import { SUBNETS } from '../shared/constants';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import type { FinishedTxData } from '../shared/types';
import type { Balance, BalanceOptions, TransferOptions, Transfer, BlazeEvent, EventType, EventSubscription } from '../shared/types';
import axios from 'axios';

const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const MAX_RETRY_DELAY = 32000; // Max retry delay of 32 seconds

export class Blaze {
    private subnet: string;
    private tokenIdentifier: string;
    private signer: string;
    public nodeUrl: string;
    private eventSource: EventSource | null = null;
    private eventHandlers: Map<EventType, Set<(event: BlazeEvent) => void>> = new Map();
    private lastBalance: Balance = { total: 0 };
    private retryCount = 0;
    private heartbeatTimeout: NodeJS.Timeout | null = null;
    private lastBalanceUpdate: number = 0;
    private walletConnected: boolean = false;
    private onWalletStateChange?: (connected: boolean) => void;

    constructor(subnet: string, signer: string, nodeUrl: string = 'https://charisma.rocks/api/v0/blaze') {
        this.signer = signer;
        this.nodeUrl = nodeUrl;

        if (!subnet) {
            throw new Error('Subnet contract address is required');
        }
        this.subnet = subnet;

        this.tokenIdentifier = SUBNETS[subnet as keyof typeof SUBNETS];
        if (!this.tokenIdentifier) {
            throw new Error(`No token identifier found for subnet: ${subnet}`);
        }

        // Initialize event handlers for each event type
        ['transfer', 'deposit', 'withdraw', 'balance', 'batch'].forEach(type => {
            this.eventHandlers.set(type as EventType, new Set());
        });
    }

    // Add wallet state change listener
    public onWalletChange(callback: (connected: boolean) => void) {
        this.onWalletStateChange = callback;
    }

    // Connect wallet
    public async connectWallet(): Promise<{ address: string } | null> {
        try {
            return new Promise((resolve) => {
                showConnect({
                    appDetails: {
                        name: 'Blaze Subnets',
                        icon: 'https://charisma.rocks/charisma.png',
                    },
                    onFinish: (data: FinishedAuthData) => {
                        this.walletConnected = true;
                        this.signer = data.userSession.loadUserData().profile.stxAddress.mainnet;
                        this.onWalletStateChange?.(true);
                        resolve({ address: data.userSession.loadUserData().profile.stxAddress.mainnet });
                    },
                    onCancel: () => {
                        this.walletConnected = false;
                        this.onWalletStateChange?.(false);
                        resolve(null);
                    },
                    userSession: undefined,
                });
            });
        } catch (error) {
            console.error('Error connecting wallet:', error);
            this.walletConnected = false;
            this.onWalletStateChange?.(false);
            return null;
        }
    }

    // Disconnect wallet
    public disconnectWallet() {
        this.walletConnected = false;
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
        // Notify about wallet state change
        this.onWalletStateChange?.(false);
    }

    // Check if wallet is connected
    public isWalletConnected(): boolean {
        return this.walletConnected;
    }

    // Get current wallet address
    public getWalletAddress(): string {
        return this.signer;
    }

    private connectEventSource() {
        if (this.eventSource?.readyState === EventSource.OPEN) {
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

        this.eventSource = new EventSource(url.toString());

        this.eventSource.onmessage = (event) => {
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

        this.eventSource.onerror = (error) => {
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
        const nextNonce = Date.now();
        const tokens = options.amount;

        const domain = createBlazeDomain();
        const message = createBlazeMessage({
            to: options.to,
            amount: tokens,
            nonce: nextNonce
        });

        const result: any = await new Promise((resolve) => {
            showSignStructuredMessage({
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
        const txOptions = buildDepositTxOptions({ subnet: this.subnet, amount });

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