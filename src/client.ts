import { Cl, Pc, PostConditionMode, makeContractCall, broadcastTransaction, TxBroadcastResult, signStructuredData } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { Balance } from '.';
import { createBlazeDomain, createBlazeMessage } from './structured-data';

const NODE_URL = 'https://charisma.rocks/api/v0/blaze/';

export interface TransferOptions {
    to: string;
    amount: number;
}

export interface TransactionResult {
    txid: string;
}

export class Blaze {
    private subnet: string;
    private tokenIdentifier: string;
    private signer: string;
    private isServer: boolean;

    constructor(subnet: string, signer: string) {
        this.signer = signer;
        this.isServer = typeof window === 'undefined';

        if (!subnet) {
            throw new Error('Subnet contract address is required');
        }
        this.subnet = subnet;

        // Get token identifier from SUBNETS mapping
        const tokenId = SUBNETS[subnet as keyof typeof SUBNETS];
        if (!tokenId) {
            throw new Error(`No token identifier found for subnet: ${subnet}`);
        }
        this.tokenIdentifier = tokenId;
    }

    private async executeServerTransaction(txOptions: any): Promise<TransactionResult> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const transaction = await makeContractCall({
            ...txOptions,
            senderKey: process.env.PRIVATE_KEY,
            network: STACKS_MAINNET,
        });

        const response: TxBroadcastResult = await broadcastTransaction({
            transaction,
            network: STACKS_MAINNET,
        });

        if ('error' in response) {
            throw new Error(response.error);
        }

        return { txid: response.txid };
    }

    async getBalance() {
        const response = await fetch(`${NODE_URL}/subnets/${this.subnet}/balances/${this.signer}`);
        const data = await response.json();
        return data as Balance;
    }

    private async signServerTransfer(message: any, domain: any): Promise<string> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }
        return signStructuredData({ message, domain, privateKey: process.env.PRIVATE_KEY });
    }

    async transfer(options: TransferOptions) {
        const nextNonce = Date.now();
        const tokens = options.amount;

        const domain = createBlazeDomain();
        const message = createBlazeMessage({
            token: this.tokenIdentifier,
            to: options.to,
            amount: tokens,
            nonce: nextNonce
        });

        let signature: string;
        if (this.isServer) {
            signature = await this.signServerTransfer(message, domain);
        } else {
            const { openStructuredDataSignatureRequestPopup } = await import("@stacks/connect");
            const result: any = await new Promise((resolve) => {
                openStructuredDataSignatureRequestPopup({
                    domain,
                    message,
                    network: STACKS_MAINNET,
                    onFinish: (data) => resolve(data),
                    onCancel: () => resolve(null)
                });
            });

            if (!result?.signature) {
                throw new Error('User cancelled or signing failed');
            }
            signature = result.signature;
        }

        // send signature to the node for processing
        const response = await fetch(`${NODE_URL}/xfer`, {
            method: 'POST',
            body: JSON.stringify({
                signature,
                signer: this.signer,
                to: options.to,
                amount: tokens,
                nonce: nextNonce,
            })
        });

        if (!response.ok) {
            console.error(response);
            throw new Error(`Transfer failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    }

    async deposit(amount: number): Promise<TransactionResult> {
        const [contractAddress, contractName] = this.subnet.split('.');
        const [contract, name] = this.tokenIdentifier.split('::');

        const txOptions = {
            contractAddress,
            contractName,
            functionName: "deposit",
            functionArgs: [Cl.uint(amount)],
            postConditions: [Pc.principal(this.signer).willSendEq(amount).ft(contract as any, name)],
            postConditionMode: PostConditionMode.Deny,
        };

        if (this.isServer) {
            return this.executeServerTransaction(txOptions);
        }

        const { openContractCall } = await import("@stacks/connect");
        const result: any = await new Promise((resolve) => {
            openContractCall({
                ...txOptions,
                network: STACKS_MAINNET,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        if (!result?.txId) {
            throw new Error('Transaction cancelled or failed');
        }

        return { txid: result.txId };
    }

    async withdraw(amount: number): Promise<TransactionResult> {
        const [contractAddress, contractName] = this.subnet.split('.');
        const [contract, name] = this.tokenIdentifier.split('::');

        const txOptions = {
            contractAddress,
            contractName,
            functionName: "withdraw",
            functionArgs: [Cl.uint(amount)],
            postConditions: [Pc.principal(contract).willSendEq(amount).ft(contract as any, name)],
            postConditionMode: PostConditionMode.Deny,
        };

        if (this.isServer) {
            return this.executeServerTransaction(txOptions);
        }

        const { openContractCall } = await import("@stacks/connect");
        const result: any = await new Promise((resolve) => {
            openContractCall({
                ...txOptions,
                network: STACKS_MAINNET,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        if (!result?.txId) {
            throw new Error('Transaction cancelled or failed');
        }

        return { txid: result.txId };
    }
}

// Keep SUBNETS mapping at the bottom
const SUBNETS = {
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-test-2':
        'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token::welshcorgicoin'
};