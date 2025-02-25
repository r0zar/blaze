import { STACKS_MAINNET } from '@stacks/network';
import { openStructuredDataSignatureRequestPopup, showConnect, FinishedAuthData, getOrCreateUserSession } from '@stacks/connect';
import { createBlazeDomain, createBlazeMessage } from '../shared/messages';
import { subnetTokens, WELSH } from '../shared/utils';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import type { TransferOptions, Transfer, FinishedTxData, TransactionResult } from '../types';
import { isBrowser } from '../shared/utils';
import axios from 'axios';

/**
 * Blaze SDK client for interacting with Blaze subnets
 * Handles wallet connections, balance queries, and transaction operations
 */
export class Blaze {
    subnet: string;
    tokenIdentifier: string;
    signer: string;
    nodeUrl: string;
    isServerSide: boolean;
    endpoints: {
        transfer: string;
        refresh: string;
    };

    constructor(options?: { nodeUrl?: string, subnet?: string }) {
        this.signer = '';
        this.nodeUrl = options?.nodeUrl || 'https://charisma.rocks/api/v0/blaze';
        this.isServerSide = !isBrowser;
        this.subnet = options?.subnet || WELSH;
        this.endpoints = {
            transfer: `/api/process`,
            refresh: `/api/refresh-balance`,
        };

        this.tokenIdentifier = subnetTokens[this.subnet as keyof typeof subnetTokens];
        if (!this.tokenIdentifier) {
            throw new Error(`No token identifier found for subnet: ${this.subnet}`);
        }

        // Warn if running in server environment
        if (this.isServerSide) {
            console.warn('Blaze client was initialized in a server environment. Some features may be limited.');
        }
    }

    /**
     * Connect to a wallet using Stacks Connect
     * @returns Connected wallet address or empty string if connection failed
     */
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

    /**
     * Disconnect current wallet
     */
    public disconnectWallet() {
        this.signer = '';
        getOrCreateUserSession().signUserOut()
    }

    /**
     * Check if wallet is connected
     * @returns True if wallet is connected
     */
    public isWalletConnected(): boolean {
        return getOrCreateUserSession().isUserSignedIn()
    }

    /**
     * Get current wallet address
     * @returns Connected wallet address
     */
    public getWalletAddress(): string {
        return getOrCreateUserSession().loadUserData().profile.stxAddress.mainnet
    }

    /**
     * Get user's balance from the subnet
     * @returns User balance as a number
     */
    async getBalance(): Promise<number> {
        if (!this.isWalletConnected()) {
            this.signer = await this.connectWallet();
        }

        // Fetch from server
        const response = await axios.get(`${this.nodeUrl}/subnets/${this.subnet}/balances/${this.signer}`);

        // Return just the numeric balance value
        return response.data.total || 0;
    }

    /**
     * Refresh balance from server - fetches the latest on-chain balance
     * @returns Updated balance as a number
     */
    async refreshBalance(): Promise<number> {
        if (!this.isWalletConnected()) {
            this.signer = await this.connectWallet();
        }

        // Request the server to refresh the on-chain balance first
        await axios.post(`${this.nodeUrl}/subnets/${this.subnet}/refresh-balance`, {
            user: this.signer
        });

        // Then get the updated balance
        return this.getBalance();
    }

    /**
     * Transfer tokens to another address
     * Creates a signed transfer and sends it to the server
     * @param options Transfer options including recipient and amount
     * @returns Transaction result
     */
    async transfer(options: TransferOptions) {
        if (!this.isWalletConnected()) {
            this.signer = await this.connectWallet();
        }

        const nextNonce = Date.now();
        const result: any = await new Promise((resolve) => {
            openStructuredDataSignatureRequestPopup({
                domain: createBlazeDomain(),
                message: createBlazeMessage({ to: options.to, amount: options.amount, nonce: nextNonce }),
                network: STACKS_MAINNET,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        if (!result?.signature) console.error('User cancelled or signing failed');
        const signature = result.signature;

        const transfer: Transfer = {
            signature,
            signer: this.signer,
            to: options.to,
            amount: options.amount,
            nonce: nextNonce,
        };

        // Send transfer to server
        const response = await axios.post(this.endpoints.transfer, transfer);
        if (response.status !== 200) {
            throw new Error(`Transfer failed: ${response.statusText}`);
        }

        return response.data;
    }

    /**
     * Initiates a deposit transaction to the subnet
     * @param amount - Amount to deposit
     * @returns Transaction result with txid
     */
    async deposit(amount: number): Promise<TransactionResult> {
        if (!this.isWalletConnected()) {
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
            console.error('Transaction cancelled or failed');
            return { txid: '' };
        }

        return { txid: result.txId };
    }

    /**
     * Initiates a withdrawal transaction from the subnet
     * @param amount - Amount to withdraw
     * @returns Transaction result with txid
     */
    async withdraw(amount: number): Promise<TransactionResult> {
        if (!this.isWalletConnected()) {
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
            console.error('Transaction cancelled or failed');
            return { txid: '' };
        }

        return { txid: result.txId };
    }
} 