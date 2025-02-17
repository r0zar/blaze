import { Cl } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

export interface SignTransferOptions {
    token: string;
    from: string;
    to: string;
    amount?: number;
    nonce?: number;
}

export interface SignTransferResult {
    signature: string;
    publicKey: string;
}

/**
 * Sign a Blaze transfer using Stacks Wallet
 * @param options Transfer details including token, from, to, amount, and optional nonce
 * @returns Promise resolving to signature data
 */
export async function signTransfer(options: SignTransferOptions): Promise<SignTransferResult> {
    const { token, to, amount, nonce } = options;

    const tokens = amount ?? 1; // Default to 1 if no amount provided
    const nextNonce = nonce ?? 1; // Default to 1 if no nonce provided

    // Create domain matching contract
    const domain = Cl.tuple({
        name: Cl.stringAscii("blaze"),
        version: Cl.stringAscii("0.1.0"),
        "chain-id": Cl.uint(STACKS_MAINNET.chainId),
    });

    // Create message tuple matching contract's make-message-hash
    const message = Cl.tuple({
        token: Cl.principal(token),
        to: Cl.principal(to),
        amount: Cl.uint(tokens),
        nonce: Cl.uint(nextNonce)
    });

    // Import connect dynamically to avoid SSR issues
    const { openStructuredDataSignatureRequestPopup } = await import("@stacks/connect");

    return new Promise((resolve) => {
        openStructuredDataSignatureRequestPopup({
            domain,
            message,
            network: STACKS_MAINNET,
            onFinish: async (data) => {
                resolve(data);
            },
        });
    });
}