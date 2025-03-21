import {
    Cl,
    ClarityValue,
    getAddressFromPrivateKey,
    signStructuredData,
} from '@stacks/transactions';

import { WriteIntent } from './intent-interfaces';

/**
 * Simple interface for structured message data
 */
export interface StructuredMessage {
    domain: ClarityValue;
    message: ClarityValue;
}

/**
 * Message signer for creating signatures for write intents
 */
export class MessageSigner {
    private privateKey?: string;
    private address: string;
    private network: 'mainnet' | 'testnet';

    /**
     * Create a new message signer
     * @param privateKey - Private key for signing messages
     * @param network - Network to use for address generation
     */
    constructor(privateKey?: string, network: 'mainnet' | 'testnet' = 'mainnet') {
        this.privateKey = privateKey;
        this.network = network;

        // If private key is provided, derive address immediately
        if (privateKey) {
            // Generate Stacks address from private key
            this.address = getAddressFromPrivateKey(privateKey, this.network);
        } else {
            // Default empty address
            this.address = '';
        }
    }

    /**
     * Get the signer's address
     */
    getAddress(): string {
        if (!this.address) {
            throw new Error('No private key provided, cannot get address');
        }
        return this.address;
    }

    /**
     * Sign a message using the private key
     * @param message - Message to sign
     * @returns Signature as hex string
     */
    signMessage(writeIntent: Partial<WriteIntent>): string {
        if (!this.privateKey) {
            throw new Error('No private key provided, cannot sign message');
        }

        const domain = Cl.tuple({
            name: Cl.stringAscii('blaze'),
            version: Cl.stringAscii('welsh-predict-v1'),
            'chain-id': this.network === 'mainnet' ? Cl.uint(1) : Cl.uint(2147483648),
        });

        const message = Cl.tuple({
            contract: Cl.stringAscii(writeIntent.contract),
            function: Cl.stringAscii(writeIntent.function),
            args: Cl.list(writeIntent.args.map((arg) => Cl.stringAscii(arg))),
            // TODO: Add sender, timestamp, nonce, postConditions
        });

        try {
            // Sign the message using stacks-transactions
            const signature = signStructuredData({
                domain,
                message,
                privateKey: this.privateKey,
            });

            return signature;
        } catch (error) {
            console.error('Failed to sign message:', error);
            throw new Error(`Signing failed: ${error.message}`);
        }
    }

    /**
     * Sign a structured message with domain and message data
     * @param structuredData - Object containing domain and message
     * @returns Signature as hex string
     */
    async signStructuredData(structuredData: StructuredMessage): Promise<string> {
        if (!this.privateKey) {
            throw new Error('No private key provided, cannot sign message');
        }

        try {
            // Sign the structured data directly
            const signature = await signStructuredData({
                domain: structuredData.domain,
                message: structuredData.message,
                privateKey: this.privateKey,
            });

            return signature;
        } catch (error) {
            console.error('Failed to sign structured data:', error);
            throw new Error(`Signing failed: ${error.message}`);
        }
    }

    /**
     * Verify a signature against a message and signer
     * @param message - Original message that was signed
     * @param signature - Signature to verify
     * @param signerAddress - Address of the signer
     * @returns Boolean indicating if signature is valid
     */
    verifySignature(
        message: any,
        signature: string,
        signerAddress: string
    ): boolean {
        try {
            // Note: This is a placeholder - in a real implementation, you would use
            // cryptographic verification to check the signature against the message and public key

            // For a real implementation, you would:
            // 1. Extract the public key from the signature
            // 2. Verify the signature against the message and public key
            // 3. Check that the public key matches the signerAddress

            // This would typically use libraries like @stacks/encryption or other verification methods
            // from @stacks/transactions
            console.log({ message, signature, signerAddress });
            console.warn('Signature verification is not fully implemented');

            // For now, just return true (assuming all signatures are valid)
            // In production, you must replace this with actual verification
            return true;
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    /**
     * Set a new private key
     * @param privateKey - New private key to use
     */
    setPrivateKey(privateKey: string): void {
        this.privateKey = privateKey;
        this.address = getAddressFromPrivateKey(privateKey, this.network);
    }
}
