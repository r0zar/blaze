import { STACKS_MAINNET } from '@stacks/network';
import { connect, disconnect, isConnected, request, getLocalStorage } from '@stacks/connect';
import {
    createWelshDomain,
    createWelshPredictionDomain,
    createTransferhMessage,
    createPredictionMessage,
    createClaimRewardMessage
} from '../shared/messages';
import { subnetTokens, WELSH, PREDICTIONS } from '../shared/utils';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import {
    type TransferOptions,
    type PredictionOptions,
    type ClaimRewardOptions,
    type Transfer,
    type Prediction,
    type ClaimReward,
    type TransactionResult,
    TransactionType
} from '../types';
import { isBrowser } from '../shared/utils';
import axios from 'axios';

/**
 * Blaze SDK client for interacting with Blaze subnets
 * Handles wallet connections, balance queries, and transaction operations
 */
export class Blaze {
    subnet: `${string}.${string}`;
    tokenIdentifier: string;
    signer: string;
    nodeUrl: string;
    isServerSide: boolean;
    endpoints: {
        transfer: string;
        predict: string;
        claim: string;
        refresh: string;
    };

    constructor(options?: { nodeUrl?: string, subnet?: `${string}.${string}` }) {
        const storage = getLocalStorage();
        this.signer = storage?.addresses.stx[0]?.address || '';
        this.nodeUrl = options?.nodeUrl || 'https://charisma.rocks/api/v0/blaze';
        this.isServerSide = !isBrowser;
        this.subnet = options?.subnet || WELSH;
        this.endpoints = {
            transfer: `/api/process`,
            predict: `/api/process`,
            claim: `/api/process`,
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
        try {
            const result = await connect();
            const stxAddress = result.addresses[2]?.address || '';
            this.signer = stxAddress;
            return stxAddress;
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
        disconnect();
    }

    /**
     * Check if wallet is connected
     * @returns True if wallet is connected
     */
    public isWalletConnected(): boolean {
        return isConnected();
    }

    /**
     * Get current wallet address
     * @returns Connected wallet address
     */
    public getWalletAddress(): string {
        return this.signer
    }

    /**
     * Get user's balance from the subnet
     * @returns User balance as a number
     */
    async getBalance(): Promise<number> {
        if (!this.signer) {
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
        if (!this.signer) {
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
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        const nextNonce = Date.now();
        const result = await request('stx_signStructuredMessage', {
            domain: createWelshDomain(),
            message: createTransferhMessage({ ...options, nonce: nextNonce }),
        });

        if (!result?.signature) console.error('User cancelled or signing failed');
        const signature = result.signature;

        const transfer: Transfer = {
            type: TransactionType.TRANSFER,
            signature,
            signer: this.signer,
            ...options,
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
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        try {

            const txOptions = buildDepositTxOptions({ subnet: this.subnet, amount, signer: this.signer });

            const result = await request('stx_callContract', {
                ...txOptions as any,
            }).catch(console.error);

            console.log('Deposit result:', result);

            return { txid: result?.txid || '' };

        } catch (error) {
            console.error('Deposit bugging out:', error);
            return { txid: '' };
        }
    }

    /**
     * Initiates a withdrawal transaction from the subnet
     * @param amount - Amount to withdraw
     * @returns Transaction result with txid
     */
    async withdraw(amount: number): Promise<TransactionResult> {
        if (!this.signer) {
            this.signer = await this.connectWallet();
        }

        const txOptions = buildWithdrawTxOptions({ subnet: this.subnet, amount, signer: this.signer });

        const result = await request('stx_callContract', {
            ...txOptions as any,
        }).catch(console.error);

        if (!result?.txid) {
            console.error('Transaction cancelled or failed');
            return { txid: '' };
        }

        return { txid: result?.txid || '' };
    }
} 