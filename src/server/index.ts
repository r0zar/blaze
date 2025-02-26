import { makeContractCall, broadcastTransaction, TxBroadcastResult, signStructuredData, fetchCallReadOnlyFunction, Cl, ClarityType, createContractCallPayload, PostCondition } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { createBlazeDomain, createBlazeMessage } from '../shared/messages';
import { subnetTokens, WELSH } from '../shared/utils';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import { TransactionResult, Transfer, Status, BlazeMessage, BaseTransaction } from '../types';
import { TransactionType } from '../types';

/**
 * Represents a single transaction in the queue
 */
export class Transaction implements BaseTransaction {
    type: TransactionType;
    affectedUsers: string[];

    constructor(public transfer: Transfer) {
        this.type = TransactionType.TRANSFER;
        this.affectedUsers = [transfer.signer, transfer.to];
    }

    /**
     * Gets the balance changes this transaction would cause
     * @returns A map of user addresses to their balance changes (positive or negative)
     */
    getBalanceChanges(): Map<string, number> {
        const changes = new Map<string, number>();
        changes.set(this.transfer.signer, -this.transfer.amount);
        changes.set(this.transfer.to, this.transfer.amount);
        return changes;
    }

    /**
     * Converts the transaction to a Clarity value for on-chain processing
     * @returns Clarity tuple for the transaction
     */
    toClarityValue(): any {
        return Cl.tuple({
            signature: Cl.bufferFromHex(this.transfer.signature),
            signer: Cl.principal(this.transfer.signer),
            to: Cl.principal(this.transfer.to),
            amount: Cl.uint(this.transfer.amount),
            nonce: Cl.uint(this.transfer.nonce),
        });
    }
}

/**
 * Manages unconfirmed transactions waiting to be mined into blocks
 * Acts as a memory pool (mempool) for transactions before they are written to the blockchain
 */
export class Mempool {
    private queue: Transaction[] = [];

    constructor(private subnet: string, private balances: Map<string, number>, private fetchContractBalance: (user: string) => Promise<number>) { }

    /**
     * Get the current transaction queue
     */
    getQueue(): Transaction[] {
        return this.queue;
    }

    /**
     * Clear the transaction queue
     */
    clearQueue(): void {
        this.queue = [];
    }

    /**
     * Add a transaction to the mempool
     */
    addTransaction(transaction: Transaction): void {
        this.queue.push(transaction);
    }

    /**
     * Get all users affected by transactions in the mempool
     */
    getAffectedUsers(): Set<string> {
        const users = new Set<string>();
        this.queue.forEach(tx => {
            tx.affectedUsers.forEach(user => users.add(user));
        });
        return users;
    }

    /**
     * Calculate pending balance changes for all users from transactions in the mempool
     * @returns Map of user addresses to their pending balance changes
     */
    getPendingBalanceChanges(): Map<string, number> {
        const pendingChanges = new Map<string, number>();

        // Apply changes from each transaction
        this.queue.forEach(tx => {
            const changes = tx.getBalanceChanges();

            // Add each change to the pending changes map
            changes.forEach((change, user) => {
                const currentChange = pendingChanges.get(user) || 0;
                pendingChanges.set(user, currentChange + change);
            });
        });

        return pendingChanges;
    }

    /**
     * Calculate total balances including pending changes from the mempool
     * @returns Map of user addresses to their total balances
     */
    getTotalBalances(): Map<string, number> {
        const totalBalances = new Map(this.balances);
        const pendingChanges = this.getPendingBalanceChanges();

        // Apply pending changes to confirmed balances
        pendingChanges.forEach((change, user) => {
            const confirmedBalance = totalBalances.get(user) || 0;
            totalBalances.set(user, confirmedBalance + change);
        });

        return totalBalances;
    }

    /**
     * Get the first batch of transactions to process (up to maxBatchSize)
     * @param maxBatchSize Maximum number of transactions to include in a block
     * @returns Array of transactions to process
     */
    getBatchToMine(maxBatchSize: number = 200): Transaction[] {
        return this.queue.slice(0, maxBatchSize);
    }

    /**
     * Remove processed transactions from the mempool
     * @param count Number of transactions to remove
     */
    removeProcessedTransactions(count: number): void {
        this.queue.splice(0, count);
    }

    /**
     * Get the balance for a specific user, including pending transactions
     * @param user User address
     * @param options Balance options
     * @returns Balance object with total, confirmed, and unconfirmed amounts
     */
    async getBalance(user: string): Promise<number> {
        // Ensure the user's on-chain balance is loaded
        if (!this.balances.has(user)) {
            await this.fetchContractBalance(user);
        }

        // Get confirmed balance
        const confirmedBalance = this.balances.get(user) || 0;

        // Calculate pending balance changes from the mempool
        const pendingChanges = this.getPendingBalanceChanges().get(user) || 0;

        return confirmedBalance + pendingChanges;
    }

    /**
     * Build batch transfer transaction options for the current contract
     * @param txsToMine Array of transactions to include in the batch
     * @param contractAddress Contract address
     * @param contractName Contract name
     * @returns Transaction options for the batch transfer
     */
    buildBatchTransferTxOptions(txsToMine: Transaction[], contractAddress: string, contractName: string): any {
        // Build the clarity operations for batch transfer
        const clarityOperations = txsToMine.map(tx => tx.toClarityValue());

        // Build transaction options
        return {
            contractAddress,
            contractName,
            functionName: 'batch-transfer',
            functionArgs: [Cl.list(clarityOperations)],
            network: STACKS_MAINNET,
            fee: 1800
        };
    }
}

export class Subnet {
    subnet: `${string}.${string}`;
    tokenIdentifier: string;
    signer: string;
    balances: Map<string, number> = new Map();
    mempool: Mempool;
    lastProcessedBlock: number;

    constructor() {
        this.signer = '';
        this.lastProcessedBlock = 0
        this.subnet = WELSH;

        this.tokenIdentifier = subnetTokens[this.subnet as keyof typeof subnetTokens];
        if (!this.tokenIdentifier) {
            throw new Error(`No token identifier found for subnet: ${this.subnet}`);
        }

        // Initialize the mempool
        this.mempool = new Mempool(
            this.subnet,
            this.balances,
            this.fetchContractBalance.bind(this)
        );
    }

    public getStatus(): Status {
        return {
            subnet: this.subnet,
            txQueue: this.mempool.getQueue(),
            lastProcessedBlock: this.lastProcessedBlock,
        };
    }

    /**
     * Fetch a user's on-chain balance from the contract
     */
    private async fetchContractBalance(user: string): Promise<number> {
        const [contractAddress, contractName] = this.subnet.split('.');
        try {
            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'get-balance',
                functionArgs: [Cl.principal(user)],
                network: STACKS_MAINNET,
                senderAddress: user
            });
            const balance = result.type === ClarityType.UInt ? Number(result.value) : 0;

            // Store the confirmed balance in our Map
            this.balances.set(user, balance);

            return balance;
        } catch (error: unknown) {
            console.error('Failed to fetch contract balance:', error);
            return 0;
        }
    }

    // get all balances
    async getBalances() {
        // First, collect all unique users affected by transactions
        const usersInQueue = this.mempool.getAffectedUsers();

        // Fetch on-chain balances for all users that might not be in the balances Map
        const fetchPromises = [];
        for (const user of Array.from(usersInQueue)) {
            if (!this.balances.has(user)) {
                fetchPromises.push(this.fetchContractBalance(user));
            }
        }

        // Wait for all balance fetches to complete
        if (fetchPromises.length > 0) {
            await Promise.all(fetchPromises);
        }

        // Get total balances with pending changes applied
        const totalBalances = this.mempool.getTotalBalances();
        return Object.fromEntries(totalBalances);
    }

    /**
     * Get a user's complete balance information
     */
    async getBalance(user?: string): Promise<number> {
        const address = user || this.signer;
        return this.mempool.getBalance(address);
    }

    private async executeTransaction(txOptions: any): Promise<TransactionResult> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const transaction = await makeContractCall({
            ...txOptions,
            senderKey: process.env.PRIVATE_KEY,
            network: STACKS_MAINNET,
        });

        const response: TxBroadcastResult = await broadcastTransaction({
            transaction,
            network: STACKS_MAINNET,
        });

        if ('error' in response) console.error(response.error);
        return { txid: response.txid };
    }

    public async processTxRequest(txRequest: Transfer) {
        await this.validateTransferOperation(txRequest);
        // create a new Transaction object and put it in the queue
        const transaction = new Transaction(txRequest);
        this.mempool.addTransaction(transaction);
    }

    /**
     * Process transactions from the mempool and mine a new block by executing a batch transfer
     * @param batchSize Optional number of transactions to process (default: up to 200)
     * @returns Transaction result containing the txid if successful
     */
    public async mineBlock(batchSize?: number): Promise<TransactionResult> {
        const queue = this.mempool.getQueue();

        // Don't process if queue is empty
        if (queue.length === 0) {
            throw new Error('No transactions to mine');
        }

        // Get contract details from subnet identifier (e.g. "ST1234.my-contract")
        const [contractAddress, contractName] = this.subnet.split('.');
        if (!contractAddress || !contractName) {
            throw new Error('Invalid contract format');
        }

        // Get transactions that will be settled (up to batchSize or 200)
        const maxBatchSize = batchSize || 200;
        const txsToMine = this.mempool.getBatchToMine(maxBatchSize);

        // Build transaction options based on transaction type
        const txOptions = this.mempool.buildBatchTransferTxOptions(
            txsToMine,
            contractAddress,
            contractName
        );

        try {
            // Execute the batch-transfer transaction
            const result = await this.executeTransaction(txOptions);

            // Remove the processed transactions from the mempool
            this.mempool.removeProcessedTransactions(txsToMine.length);

            // Note: We no longer refresh balances here since on-chain updates take ~30 seconds
            // Users can explicitly refresh balances when needed or wait for SSE events

            return result;
        } catch (error) {
            console.error('Failed to mine block:', error);
            throw error;
        }
    }

    async deposit(amount: number) {
        try {
            // Build deposit transaction options
            const txOptions = buildDepositTxOptions({
                signer: this.signer,
                subnet: this.subnet,
                amount,
            });

            // Execute the deposit transaction
            const result = await this.executeTransaction(txOptions);

            // Note: We don't refresh balance here since on-chain updates take ~30 seconds
            // Users should explicitly refresh balances when needed or wait for SSE events

            return result;
        } catch (error: unknown) {
            throw error;
        }
    }

    async withdraw(amount: number) {
        try {
            // Build withdraw transaction options
            const txOptions = buildWithdrawTxOptions({
                subnet: this.subnet,
                amount,
                signer: this.signer
            });

            // Execute the withdraw transaction
            const result = await this.executeTransaction(txOptions);

            // Note: We don't refresh balance here since on-chain updates take ~30 seconds
            // Users should explicitly refresh balances when needed or wait for SSE events

            return result;
        } catch (error: unknown) {
            throw error;
        }
    }

    async generateSignature(message: BlazeMessage): Promise<string> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }
        const signature = await signStructuredData({
            domain: createBlazeDomain(),
            message: createBlazeMessage(message),
            privateKey: process.env.PRIVATE_KEY
        });
        return signature;
    }

    async verifySignature(transfer: Transfer): Promise<boolean> {
        const [contractAddress, contractName] = this.subnet.split('.');
        try {
            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'verify-signature',
                functionArgs: [
                    Cl.bufferFromHex(transfer.signature),
                    Cl.principal(transfer.signer),
                    Cl.principal(transfer.to),
                    Cl.uint(transfer.amount),
                    Cl.uint(transfer.nonce)
                ],
                network: STACKS_MAINNET,
                senderAddress: transfer.signer
            });

            return result.type === ClarityType.BoolTrue;
        } catch (error: unknown) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    async validateTransferOperation(operation: Transfer): Promise<void> {
        if (!operation.to || !operation.signer || !operation.signature) {
            throw new Error('Invalid transfer operation: missing required fields');
        }
        if (operation.amount <= 0) {
            throw new Error('Invalid transfer operation: amount must be positive');
        }
        if (operation.nonce <= 0) {
            throw new Error('Invalid transfer operation: nonce must be positive');
        }
        // Verify signature
        const isValid = await this.verifySignature(operation);
        if (!isValid) {
            throw new Error('Invalid transfer operation: signature verification failed');
        }
    }

    /**
     * Refresh on-chain balances for a specific user or all users in the balances Map
     */
    async refreshBalances(user?: string): Promise<void> {
        if (user) {
            // Refresh for a single user
            await this.fetchContractBalance(user);
        } else {
            // Refresh for all users in the balances Map
            const refreshPromises = Array.from(this.balances.keys()).map(address =>
                this.fetchContractBalance(address)
            );

            if (refreshPromises.length > 0) {
                await Promise.all(refreshPromises);
            }
        }
    }
}