import { Cl, Pc, PostConditionMode } from '@stacks/transactions';
import { WithdrawOptions, DepositOptions } from '../types';
import { subnetTokens } from './utils';

export function buildDepositTxOptions(options: DepositOptions) {
    const [contractAddress, contractName] = options.subnet.split('.');
    const [tokenPrincipal, tokenName] = subnetTokens[options.subnet as keyof typeof subnetTokens].split('::')

    return {
        contractAddress,
        contractName,
        functionName: 'deposit',
        functionArgs: [
            Cl.uint(options.amount)
        ],
        postConditions: [
            Pc.principal(options.signer).willSendEq(options.amount).ft(tokenPrincipal as any, tokenName)
        ],
        postConditionMode: PostConditionMode.Deny
    };
}

export function buildWithdrawTxOptions(options: WithdrawOptions) {
    const [contractAddress, contractName] = options.subnet.split('.');
    const [tokenPrincipal, tokenName] = subnetTokens[options.subnet as keyof typeof subnetTokens].split('::')

    return {
        contractAddress,
        contractName,
        functionName: 'withdraw',
        functionArgs: [
            Cl.uint(options.amount)
        ],
        postConditions: [
            Pc.principal(options.subnet).willSendEq(options.amount).ft(tokenPrincipal as any, tokenName)
        ],
        postConditionMode: PostConditionMode.Deny
    };
} 