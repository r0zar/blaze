import { Cl, Pc, PostConditionMode } from '@stacks/transactions';
import { WithdrawOptions, DepositOptions } from '../types';
import { subnetTokens } from './utils';

export function buildDepositTxOptions(options: DepositOptions) {
    const [tokenPrincipal, tokenName] = subnetTokens[options.subnet as keyof typeof subnetTokens].split('::')

    return {
        contract: options.subnet,
        functionName: 'deposit',
        functionArgs: [
            Cl.uint(options.amount)
        ],
        postConditions: [
            // Pc.principal(options.signer).willSendEq(options.amount).ft(tokenPrincipal as any, tokenName) as any
        ],
        address: options.signer,
        network: 'mainnet',
        fee: 1000,
        postConditionMode: PostConditionMode.Allow
    };
}

export function buildWithdrawTxOptions(options: WithdrawOptions) {
    const [tokenPrincipal, tokenName] = subnetTokens[options.subnet as keyof typeof subnetTokens].split('::')

    return {
        contract: options.subnet,
        functionName: 'withdraw',
        functionArgs: [
            Cl.uint(options.amount)
        ],
        postConditions: [
            // Pc.principal(options.subnet).willSendEq(options.amount).ft(tokenPrincipal as any, tokenName) as any
        ],
        address: options.signer,
        network: 'mainnet',
        fee: 1000,
        postConditionMode: PostConditionMode.Allow,
    };
} 