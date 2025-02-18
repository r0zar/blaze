import { Cl, Pc, PostConditionMode } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { Balance } from '.';

const NODE_URL = 'https://charisma.rocks/api/v0/blaze/';

export interface TransferOptions {
    to: string;
    amount: number;
}

export class Blaze {
    private subnet: string;
    private tokenIdentifier: string;
    private signer: string;

    constructor(subnet: string, signer: string) {
        this.signer = signer;

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

    async getBalance() {
        const response = await fetch(`${NODE_URL}/subnets/${this.subnet}/balances/${this.signer}`);
        const data = await response.json();
        return data as Balance;
    }

    async transfer(options: TransferOptions) {
        const nextNonce = Date.now();
        const tokens = options.amount;

        const domain = Cl.tuple({
            name: Cl.stringAscii("blaze"),
            version: Cl.stringAscii("0.1.0"),
            "chain-id": Cl.uint(STACKS_MAINNET.chainId),
        });

        const message = Cl.tuple({
            token: Cl.principal(this.tokenIdentifier),
            to: Cl.principal(options.to),
            amount: Cl.uint(tokens),
            nonce: Cl.uint(nextNonce)
        });

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

        console.log(result);

        if (result.signature) {
            // send signature to the node for processing
            const response = await fetch(`${NODE_URL}/xfer`, {
                method: 'POST',
                body: JSON.stringify({
                    signature: result.signature,
                    signer: this.signer,
                    to: options.to,
                    amount: tokens,
                    nonce: nextNonce,
                })
            });
            const data = await response.json();
            return data;
        }

        return result;
    }

    async deposit(amount: number) {
        const [contractAddress, contractName] = this.subnet.split('.');
        const [contract, name] = this.tokenIdentifier.split('::');

        const contractCall = {
            contractAddress,
            contractName,
            functionName: "deposit",
            functionArgs: [Cl.uint(amount)],
            postConditions: [Pc.principal(this.signer).willSendEq(amount).ft(contract as any, name)],
            postConditionMode: PostConditionMode.Deny,
            network: STACKS_MAINNET
        };

        const { openContractCall } = await import("@stacks/connect");
        const result = await new Promise((resolve) => {
            openContractCall({
                ...contractCall,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        console.log(result);

        return result as any;
    }

    async withdraw(amount: number) {
        const [contractAddress, contractName] = this.subnet.split('.');
        const [contract, name] = this.tokenIdentifier.split('::');

        const contractCall = {
            contractAddress,
            contractName,
            functionName: "withdraw",
            functionArgs: [Cl.uint(amount)],
            postConditions: [Pc.principal(contract).willSendEq(amount).ft(contract as any, name)],
            postConditionMode: PostConditionMode.Deny,
            network: STACKS_MAINNET,
        };

        const { openContractCall } = await import("@stacks/connect");
        const result = await new Promise((resolve) => {
            openContractCall({
                ...contractCall,
                onFinish: (data) => resolve(data),
                onCancel: () => resolve(null)
            });
        });

        console.log(result);

        return result as any;
    }
}

// Keep SUBNETS mapping at the bottom
const SUBNETS = {
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-test-2':
        'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token::welshcorgicoin'
};