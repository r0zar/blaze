import { makeContractCall, broadcastTransaction, TxBroadcastResult, signStructuredData, fetchCallReadOnlyFunction, Cl, ClarityType, createContractCallPayload, PostCondition } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { createWelshDomain, createTransferhMessage } from '../shared/messages';
import { subnetTokens, WELSH } from '../shared/utils';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import { TransactionResult, Transfer, Prediction, ClaimReward, Status, TransferMessage, BaseTransaction, TransactionRequest } from '../types';
import { TransactionType } from '../types';

/**
 * Represents a single transaction in the queue
 */
export class Transaction implements BaseTransaction {
    type: TransactionType;
    affectedUsers: string[];
    data: TransactionRequest;
    batchFunction: string;

    constructor(data: TransactionRequest) {
        this.data = data;
        this.type = data.type;
        this.batchFunction = `signed-${this.type}`;

        // Set affected users based on transaction type
        if (this.type === TransactionType.TRANSFER) {
            const transfer = data as Transfer;
            this.affectedUsers = [transfer.signer, transfer.to];
        } else {
            // For other types, only the signer is affected
            this.affectedUsers = [data.signer];
        }
    }

    /**
     * Gets the balance changes this transaction would cause
     * @returns A map of user addresses to their balance changes (positive or negative)
     */
    getBalanceChanges(): Map<string, number> {
        const changes = new Map<string, number>();

        if (this.type === TransactionType.TRANSFER) {
            const transfer = this.data as Transfer;
            changes.set(transfer.signer, -transfer.amount);
            changes.set(transfer.to, transfer.amount);
        } else if (this.type === TransactionType.PREDICT) {
            const prediction = this.data as Prediction;
            changes.set(prediction.signer, -prediction.amount);
        }
        // For claim reward, we don't include it in balance changes
        // since we can't predict the exact amount without contract lookup

        return changes;
    }

    /**
     * Converts the transaction to a Clarity value for on-chain processing
     * @returns Clarity tuple for the transaction
     */
    toClarityValue(): any {
        switch (this.type) {
            case TransactionType.TRANSFER: {
                const transfer = this.data as Transfer;
                return Cl.tuple({
                    signet: Cl.tuple({
                        signature: Cl.bufferFromHex(transfer.signature),
                        nonce: Cl.uint(transfer.nonce)
                    }),
                    to: Cl.principal(transfer.to),
                    amount: Cl.uint(transfer.amount)
                });
            }
            case TransactionType.PREDICT: {
                const prediction = this.data as Prediction;
                return Cl.tuple({
                    signet: Cl.tuple({
                        signature: Cl.bufferFromHex(prediction.signature),
                        nonce: Cl.uint(prediction.nonce)
                    }),
                    market_id: Cl.uint(prediction.marketId),
                    outcome_id: Cl.uint(prediction.outcomeId),
                    amount: Cl.uint(prediction.amount)
                });
            }
            case TransactionType.CLAIM_REWARD: {
                const claim = this.data as ClaimReward;
                return Cl.tuple({
                    signet: Cl.tuple({
                        signature: Cl.bufferFromHex(claim.signature),
                        nonce: Cl.uint(claim.nonce)
                    }),
                    receipt_id: Cl.uint(claim.receiptId)
                });
            }
            default:
                throw new Error(`Cannot convert transaction type ${this.type} to Clarity value`);
        }
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
     * Get transactions of a specific type (up to maxBatchSize)
     * @param type Transaction type to filter
     * @param maxBatchSize Maximum number of transactions to include
     * @returns Array of transactions of the specified type
     */
    getBatchByType(type: TransactionType, maxBatchSize: number = 200): Transaction[] {
        return this.queue
            .filter(tx => tx.type === type)
            .slice(0, maxBatchSize);
    }

    /**
     * Group transactions by type
     * @returns Map of transaction types to arrays of transactions
     */
    getTransactionsByType(): Map<TransactionType, Transaction[]> {
        const txByType = new Map<TransactionType, Transaction[]>();

        this.queue.forEach(tx => {
            const txs = txByType.get(tx.type) || [];
            txs.push(tx);
            txByType.set(tx.type, txs);
        });

        return txByType;
    }

    /**
     * Remove transactions from the queue
     * @param transactions Array of transactions to remove
     */
    removeTransactions(transactions: Transaction[]): void {
        const txSet = new Set(transactions);
        this.queue = this.queue.filter(tx => !txSet.has(tx));
    }

    /**
     * Get the balance for a specific user, including pending transactions
     * @param user User address
     * @returns Balance for the user
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
     * Build batch transaction options for a set of transactions
     * @param txsToMine Array of transactions to include in the batch
     * @param txType Type of transactions being processed
     * @param contractAddress Contract address
     * @param contractName Contract name
     * @param functionName Name of the batch function to call
     * @returns Transaction options for the batch operation
     */
    buildBatchTxOptions(
        txsToMine: Transaction[],
        txType: TransactionType,
        contractAddress: string,
        contractName: string,
    ): any {
        // Build the clarity operations for the batch
        const clarityOperations = txsToMine.map(tx => tx.toClarityValue());

        // Calculate the fee based on the number of transactions
        const fee = 400 * txsToMine.length;

        // Build transaction options
        return {
            contractAddress,
            contractName,
            functionName: `batch-${txType}`,
            functionArgs: [Cl.list(clarityOperations)],
            network: STACKS_MAINNET,
            fee
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

        const response = await broadcastTransaction({
            transaction,
            network: STACKS_MAINNET,
        });

        return response
    }

    public async processTxRequest(txRequest: TransactionRequest) {
        // Validate based on transaction type
        switch (txRequest.type) {
            case TransactionType.TRANSFER:
                await this.validateTransferOperation(txRequest as Transfer);
                break;
            case TransactionType.PREDICT:
                await this.validatePredictionOperation(txRequest as Prediction);
                break;
            case TransactionType.CLAIM_REWARD:
                await this.validateClaimOperation(txRequest as ClaimReward);
                break;
            default:
                throw new Error(`Unknown transaction type: ${txRequest.type}`);
        }

        // Create a new Transaction object and put it in the queue
        const transaction = new Transaction(txRequest);
        this.mempool.addTransaction(transaction);
    }

    /**
     * Process transactions from the mempool and mine a new block
     * Groups transactions by type and processes each group separately
     * @param batchSize Optional number of transactions to process (default: up to 200)
     * @returns Transaction result containing the txid if successful
     */
    public async mineBlock(batchSize?: number): Promise<TransactionResult> {
        const queue = this.mempool.getQueue();

        // Don't process if queue is empty
        if (queue.length === 0) {
            throw new Error('No transactions to mine');
        }

        // Group transactions by type
        const txByType = this.mempool.getTransactionsByType();
        const maxBatchSize = batchSize || 200;

        // Process each type of transaction separately
        for (const [txType, txs] of txByType.entries()) {
            if (txs.length === 0) continue;

            // Get the contract info for this transaction type
            const [contractAddress, contractName] = this.subnet.split('.');

            if (!contractAddress || !contractName) {
                console.error(`Invalid contract format for ${txType}`);
                continue;
            }

            // Get transactions to mine (up to batch size)
            const txsToMine = txs.slice(0, maxBatchSize);

            // Build transaction options
            const txOptions = this.mempool.buildBatchTxOptions(
                txsToMine,
                txType,
                contractAddress,
                contractName,
            );

            try {
                // Execute the batch transaction
                const result = await this.executeTransaction(txOptions);

                // Remove the processed transactions from the mempool
                this.mempool.removeTransactions(txsToMine);

                // Return after processing one batch - we can process more in the next mine call
                return result;
            } catch (error) {
                console.error(`Failed to mine ${txType} transactions:`, error);
                // Continue with next transaction type
            }
        }

        throw new Error('Failed to mine any transactions');
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

    async generateSignature(message: TransferMessage): Promise<string> {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }
        const signature = await signStructuredData({
            domain: createWelshDomain(),
            message: createTransferhMessage(message),
            privateKey: process.env.PRIVATE_KEY
        });
        return signature;
    }

    async verifyTransferSignature(data: Transfer | Prediction): Promise<boolean> {
        const [contractAddress, contractName] = this.subnet.split('.');
        try {
            // Determine recipient based on transaction type
            const recipient = data.type === TransactionType.TRANSFER
                ? (data as Transfer).to
                : this.subnet

            const amount = data.type === TransactionType.TRANSFER
                ? (data as Transfer).amount
                : (data as Prediction).amount;

            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'verify-transfer-signer',
                functionArgs: [
                    Cl.tuple({
                        signature: Cl.bufferFromHex(data.signature),
                        nonce: Cl.uint(data.nonce)
                    }),
                    Cl.principal(recipient),
                    Cl.uint(amount)
                ],
                network: STACKS_MAINNET,
                senderAddress: data.signer
            });

            return result.type === ClarityType.ResponseOk;
        } catch (error: unknown) {
            console.error('Transfer signature verification failed:', error);
            return false;
        }
    }

    async verifyClaimSignature(claim: ClaimReward): Promise<boolean> {
        const [contractAddress, contractName] = this.subnet.split('.');
        try {
            const result = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'verify-receipt-signer',
                functionArgs: [
                    Cl.tuple({
                        signature: Cl.bufferFromHex(claim.signature),
                        nonce: Cl.uint(claim.nonce)
                    }),
                    Cl.uint(claim.receiptId)
                ],
                network: STACKS_MAINNET,
                senderAddress: claim.signer
            });

            return result.type === ClarityType.ResponseOk;
        } catch (error: unknown) {
            console.error('Claim signature verification failed:', error);
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
        const isValid = await this.verifyTransferSignature(operation);
        if (!isValid) {
            throw new Error('Invalid transfer operation: signature verification failed');
        }
    }

    async validatePredictionOperation(operation: Prediction): Promise<void> {
        if (!operation.signer || !operation.signature) {
            throw new Error('Invalid prediction operation: missing required fields');
        }
        if (operation.amount <= 0) {
            throw new Error('Invalid prediction operation: amount must be positive');
        }
        if (operation.nonce <= 0) {
            throw new Error('Invalid prediction operation: nonce must be positive');
        }
        if (operation.marketId < 0 || operation.outcomeId < 0) {
            throw new Error('Invalid prediction operation: market/outcome IDs must be positive');
        }

        // Verify signature using the same method as transfers
        // since predictions use the same token transfer signature
        const isValid = await this.verifyTransferSignature(operation);
        if (!isValid) {
            throw new Error('Invalid prediction operation: signature verification failed');
        }
    }

    async validateClaimOperation(operation: ClaimReward): Promise<void> {
        if (!operation.signer || !operation.signature) {
            throw new Error('Invalid claim operation: missing required fields');
        }
        if (operation.nonce <= 0) {
            throw new Error('Invalid claim operation: nonce must be positive');
        }
        if (operation.receiptId <= 0) {
            throw new Error('Invalid claim operation: receipt ID must be positive');
        }

        // Verify claim signature with the receipt verification function
        const isValid = await this.verifyClaimSignature(operation);
        if (!isValid) {
            throw new Error('Invalid claim operation: signature verification failed');
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