import { Cl, Pc, PostConditionMode } from '@stacks/transactions';

export interface TransactionOptions {
    contractAddress: string;
    contractName: string;
    functionName: string;
    functionArgs: any[];
    postConditions: any[];
    postConditionMode: PostConditionMode;
}

export interface BuildDepositTxOptionsParams {
    subnet: string;
    tokenIdentifier: string;
    signer: string;
    amount: number;
}

export interface BuildWithdrawTxOptionsParams {
    subnet: string;
    tokenIdentifier: string;
    amount: number;
}

export function buildDepositTxOptions(params: BuildDepositTxOptionsParams): TransactionOptions {
    const { subnet, tokenIdentifier, signer, amount } = params;

    if (!subnet || !tokenIdentifier || !signer || amount <= 0) {
        throw new Error('Invalid parameters for building deposit transaction options');
    }

    const [contractAddress, contractName] = subnet.split('.');
    const [tokenContract, tokenName] = tokenIdentifier.split('::');

    if (!contractAddress || !contractName || !tokenContract || !tokenName) {
        throw new Error('Invalid subnet or token identifier format');
    }

    return {
        contractAddress,
        contractName,
        functionName: "deposit",
        functionArgs: [Cl.uint(amount)],
        postConditions: [Pc.principal(signer).willSendEq(amount).ft(tokenContract as any, tokenName)],
        postConditionMode: PostConditionMode.Deny,
    };
}

export function buildWithdrawTxOptions(params: BuildWithdrawTxOptionsParams): TransactionOptions {
    const { subnet, tokenIdentifier, amount } = params;

    if (!subnet || !tokenIdentifier || amount <= 0) {
        throw new Error('Invalid parameters for building withdraw transaction options');
    }

    const [contractAddress, contractName] = subnet.split('.');
    const [tokenContract, tokenName] = tokenIdentifier.split('::');

    if (!contractAddress || !contractName || !tokenContract || !tokenName) {
        throw new Error('Invalid subnet or token identifier format');
    }

    return {
        contractAddress,
        contractName,
        functionName: "withdraw",
        functionArgs: [Cl.uint(amount)],
        postConditions: [Pc.principal(tokenContract).willSendEq(amount).ft(tokenContract as any, tokenName)],
        postConditionMode: PostConditionMode.Deny,
    };
} 