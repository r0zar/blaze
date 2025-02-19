import { Cl } from '@stacks/transactions';

interface DepositOptions {
    subnet: string;
    amount: number;
}

interface WithdrawOptions {
    subnet: string;
    amount: number;
}

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