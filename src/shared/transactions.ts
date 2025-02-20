import { Cl } from '@stacks/transactions';
import { WithdrawOptions, DepositOptions } from '../types';

export function buildDepositTxOptions(options: DepositOptions) {
    const [contractAddress, contractName] = options.subnet.split('.');

    return {
        contractAddress,
        contractName,
        functionName: 'deposit',
        functionArgs: [
            Cl.uint(options.amount)
        ]
    };
}

export function buildWithdrawTxOptions(options: WithdrawOptions) {
    const [contractAddress, contractName] = options.subnet.split('.');

    return {
        contractAddress,
        contractName,
        functionName: 'withdraw',
        functionArgs: [
            Cl.uint(options.amount)
        ]
    };
} 