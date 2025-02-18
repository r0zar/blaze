import { Cl } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

export interface BlazeMessage {
    token: string;
    to: string;
    amount: number;
    nonce: number;
}

/**
 * Creates a consistent domain tuple for Blaze signatures
 */
export function createBlazeDomain() {
    return Cl.tuple({
        name: Cl.stringAscii("blaze"),
        version: Cl.stringAscii("0.1.0"),
        "chain-id": Cl.uint(STACKS_MAINNET.chainId),
    });
}

/**
 * Creates a consistent message tuple for Blaze signatures
 */
export function createBlazeMessage(message: BlazeMessage) {
    return Cl.tuple({
        token: Cl.principal(message.token),
        to: Cl.principal(message.to),
        amount: Cl.uint(message.amount),
        nonce: Cl.uint(message.nonce)
    });
} 