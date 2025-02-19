import { kv } from '@vercel/kv';
import { fetchCallReadOnlyFunction, Cl, ClarityType } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

export interface BalanceOptions {
    includeConfirmed?: boolean;
    includeUnconfirmed?: boolean;
}

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
 * Get a user's balance information based on options
 * By default, returns total balance (confirmed + unconfirmed)
 * Use options to get specific balance types
 */
export async function getBalance(
    contract: string,
    user: string,
    options: BalanceOptions = {}
): Promise<{ total: number; confirmed?: number; unconfirmed?: number }> {
    const { includeConfirmed = false, includeUnconfirmed = false } = options;
    const getTotal = !includeConfirmed && !includeUnconfirmed;

    const [confirmed, unconfirmed] = await Promise.all([
        getConfirmedBalance(contract, user),
        getUnconfirmedBalance(contract, user)
    ]);

    const result: { total: number; confirmed?: number; unconfirmed?: number } = {
        total: confirmed + unconfirmed
    };

    if (includeConfirmed) {
        result.confirmed = confirmed;
    }

    if (includeUnconfirmed) {
        result.unconfirmed = unconfirmed;
    }

    return result;
}

/**
 * Update a user's balance with options to specify which balances to update
 */
export async function updateBalance(
    contract: string,
    user: string,
    amount: number,
    options: BalanceOptions = {}
): Promise<void> {
    const { includeConfirmed = false, includeUnconfirmed = false } = options;
    const updateTotal = !includeConfirmed && !includeUnconfirmed;

    if (updateTotal || includeConfirmed) {
        await updateConfirmedBalance(contract, user, amount);
    }

    if (updateTotal || includeUnconfirmed) {
        await updateUnconfirmedBalance(contract, user, amount);
    }
}

/**
 * Process a deposit event from chainhook
 * The event represents the true state, so we update KV to match
 */
export async function processDepositEvent(contract: string, user: string, amount: number): Promise<void> {
    const [confirmed, unconfirmed] = await Promise.all([
        getConfirmedBalance(contract, user),
        getUnconfirmedBalance(contract, user)
    ]);

    await Promise.all([
        updateConfirmedBalance(contract, user, confirmed + amount),
        updateUnconfirmedBalance(contract, user, unconfirmed + amount)
    ]);

    console.log(`Deposit event processed for ${user}, new balance: ${confirmed + amount}`);
}

/**
 * Process a withdrawal event from chainhook
 * The event represents the true state, so we update KV to match
 */
export async function processWithdrawEvent(contract: string, user: string, amount: number): Promise<void> {
    const [confirmed, unconfirmed] = await Promise.all([
        getConfirmedBalance(contract, user),
        getUnconfirmedBalance(contract, user)
    ]);

    await Promise.all([
        updateConfirmedBalance(contract, user, confirmed - amount),
        updateUnconfirmedBalance(contract, user, unconfirmed - amount)
    ]);

    console.log(`Withdrawal event processed for ${user}, new balance: ${confirmed - amount}`);
}

/**
 * Process a transfer event from chainhook
 * The event represents the true state, so we update KV to match
 */
export async function processTransferEvent(contract: string, from: string, to: string, amount: number): Promise<void> {
    const [fromConfirmed, fromUnconfirmed, toConfirmed, toUnconfirmed] = await Promise.all([
        getConfirmedBalance(contract, from),
        getUnconfirmedBalance(contract, from),
        getConfirmedBalance(contract, to),
        getUnconfirmedBalance(contract, to)
    ]);

    // Update both balances to match chain state
    await Promise.all([
        updateConfirmedBalance(contract, from, fromConfirmed - amount),
        updateUnconfirmedBalance(contract, from, fromUnconfirmed - amount),
        updateConfirmedBalance(contract, to, toConfirmed + amount),
        updateUnconfirmedBalance(contract, to, toUnconfirmed + amount)
    ]);

    console.log(`Transfer event processed for ${from} -> ${to}, new balances: ${fromConfirmed - amount} and ${toConfirmed + amount}`);
} 