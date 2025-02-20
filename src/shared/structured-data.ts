import { Cl } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { BlazeMessage } from 'src/types';

export function createBlazeDomain() {
    return Cl.tuple({
        name: Cl.stringAscii("blaze"),
        version: Cl.stringAscii("0.1.1"),
        "chain-id": Cl.uint(STACKS_MAINNET.chainId),
    });
}

export function createBlazeMessage(message: BlazeMessage) {
    return Cl.tuple({
        to: Cl.principal(message.to),
        amount: Cl.uint(message.amount),
        nonce: Cl.uint(message.nonce)
    });
}