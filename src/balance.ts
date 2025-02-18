import { kv } from '@vercel/kv';
import { fetchCallReadOnlyFunction, Cl, ClarityType } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

/**
 * Get the storage key for a user's balance
 */
export function getBalanceKey(contract: string, user: string, type: 'confirmed' | 'unconfirmed'): string {
    return `${contract}:${user}:${type}`;
}

/**
 * Fetch a user's on-chain balance from the contract
 */
export async function fetchContractBalance(contract: string, user: string): Promise<number> {
    const [contractAddress, contractName] = contract.split('.');
    try {
        const result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'get-balance',
            functionArgs: [Cl.principal(user)],
            network: STACKS_MAINNET,
            senderAddress: user
        });
        return result.type === ClarityType.UInt ? Number(result.value) : 0;
    } catch (error) {
        console.error('Failed to fetch contract balance:', error);
        return 0;
    }
}

/**
 * Get a user's confirmed balance from KV store, fetching from contract if not found
 */
export async function getConfirmedBalance(contract: string, user: string): Promise<number> {
    const key = getBalanceKey(contract, user, 'confirmed');
    const storedBalance = await kv.get<number>(key);

    if (storedBalance === null) {
        // First time: fetch from contract and store
        const contractBalance = await fetchContractBalance(contract, user);
        await kv.set(key, contractBalance);
        return contractBalance;
    }

    return storedBalance;
}

/**
 * Get a user's unconfirmed balance changes from KV store
 */
export async function getUnconfirmedBalance(contract: string, user: string): Promise<number> {
    const key = getBalanceKey(contract, user, 'unconfirmed');
    return await kv.get<number>(key) ?? 0;
}

/**
 * Update a user's confirmed balance in KV store
 */
export async function updateConfirmedBalance(contract: string, user: string, amount: number): Promise<void> {
    const key = getBalanceKey(contract, user, 'confirmed');
    await kv.set(key, amount);
}

/**
 * Update a user's unconfirmed balance in KV store
 */
export async function updateUnconfirmedBalance(contract: string, user: string, amount: number): Promise<void> {
    const key = getBalanceKey(contract, user, 'unconfirmed');
    await kv.set(key, amount);
}

/**
 * Get a user's complete balance information
 */
export async function getFullBalance(contract: string, user: string): Promise<{ confirmed: number; unconfirmed: number; total: number }> {
    const [confirmed, unconfirmed] = await Promise.all([
        getConfirmedBalance(contract, user),
        getUnconfirmedBalance(contract, user)
    ]);

    return {
        confirmed,
        unconfirmed,
        total: confirmed + unconfirmed
    };
}

/**
 * Process a deposit event from chainhook
 * The event represents the true state, so we update KV to match
 */
export async function processDepositEvent(contract: string, user: string, amount: number): Promise<void> {
    const key = getBalanceKey(contract, user, 'confirmed');
    const currentBalance = await kv.get<number>(key) ?? 0;
    await kv.set(key, currentBalance + amount);
    console.log(`Deposit event processed for ${user}, new balance: ${currentBalance + amount}`);
}

/**
 * Process a withdrawal event from chainhook
 * The event represents the true state, so we update KV to match
 */
export async function processWithdrawEvent(contract: string, user: string, amount: number): Promise<void> {
    const key = getBalanceKey(contract, user, 'confirmed');
    const currentBalance = await kv.get<number>(key) ?? 0;
    await kv.set(key, currentBalance - amount);
    console.log(`Withdrawal event processed for ${user}, new balance: ${currentBalance - amount}`);
}

/**
 * Process a transfer event from chainhook
 * The event represents the true state, so we update KV to match
 */
export async function processTransferEvent(contract: string, from: string, to: string, amount: number): Promise<void> {
    const fromKey = getBalanceKey(contract, from, 'confirmed');
    const toKey = getBalanceKey(contract, to, 'confirmed');

    const [fromBalanceOrNull, toBalanceOrNull] = await Promise.all([
        kv.get<number>(fromKey),
        kv.get<number>(toKey)
    ]);

    const fromBalance = fromBalanceOrNull ?? 0;
    const toBalance = toBalanceOrNull ?? 0;

    // Update both balances to match chain state
    await Promise.all([
        kv.set(fromKey, fromBalance - amount),
        kv.set(toKey, toBalance + amount)
    ]);
    console.log(`Transfer event processed for ${from} -> ${to}, new balances: ${fromBalance - amount} and ${toBalance + amount}`);
} 