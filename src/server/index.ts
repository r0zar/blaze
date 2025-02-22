import { makeContractCall, broadcastTransaction, TxBroadcastResult, signStructuredData, fetchCallReadOnlyFunction, Cl, ClarityType, createContractCallPayload, PostCondition } from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { createBlazeDomain, createBlazeMessage } from '../shared/messages';
import { subnetTokens, WELSH } from '../shared/utils';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../shared/transactions';
import type { Balance, TransferOptions, TransactionResult, Transfer, Status, BlazeEvent, BalanceOptions, BlazeMessage, TxRequest } from '../types';
import { kv } from '@vercel/kv';

export class Subnet {
    subnet: string;
    tokenIdentifier: string;
    signer: string;
    queue: Transaction[];
    lastProcessedBlock: number;
    eventClients: Map<string, Set<(event: BlazeEvent) => void>> = new Map();
    privateKey: string | undefined;
    balances: Map<string, number> = new Map();

    constructor() {
        this.signer = '';
        this.queue = [];
        this.lastProcessedBlock = 0
        this.subnet = WELSH;

        this.tokenIdentifier = subnetTokens[this.subnet as keyof typeof subnetTokens];
        if (!this.tokenIdentifier) {
            throw new Error(`No token identifier found for subnet: ${this.subnet}`);
        }
    }

    public addEventClient(signer: string, callback: (event: BlazeEvent) => void) {
        if (!this.eventClients.has(signer)) {
            this.eventClients.set(signer, new Set());
        }
        this.eventClients.get(signer)?.add(callback);
    }

    public removeEventClient(signer: string, callback: (event: BlazeEvent) => void) {
        this.eventClients.get(signer)?.delete(callback);
        if (this.eventClients.get(signer)?.size === 0) {
            this.eventClients.delete(signer);
        }
    }

    private emitEvent(event: BlazeEvent) {
        // Emit to specific signer if event is targeted
        if (event.data.from) {
            this.eventClients.get(event.data.from)?.forEach(callback => callback(event));
        }
        if (event.data.to) {
            this.eventClients.get(event.data.to)?.forEach(callback => callback(event));
        }

        // Emit to all clients interested in this contract's events
        this.eventClients.get(this.subnet)?.forEach(callback => callback(event));
    }

    public getStatus(): Status {
        return {
            subnet: this.subnet,
            txQueue: this.queue,
            lastProcessedBlock: this.lastProcessedBlock,
        };
    }

    private getBalanceKey(type: 'confirmed' | 'unconfirmed', user?: string): string {
        const address = user || this.signer;
        return `${this.subnet}:${address}:${type}`;
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
        } catch (error) {
            console.error('Failed to fetch contract balance:', error);
            return 0;
        }
    }

    /**
     * Get a user's confirmed balance from KV store, fetching from contract if not found
     */
    private async getConfirmedBalance(user: string): Promise<number> {
        const key = this.getBalanceKey('confirmed', user);
        const storedBalance = await kv.get<number>(key);

        if (storedBalance === null) {
            // First time: fetch from contract and store
            const contractBalance = await this.fetchContractBalance(user);
            await kv.set(key, contractBalance);
            return contractBalance;
        }

        return storedBalance;
    }

    /**
     * Get a user's unconfirmed balance changes from KV store
     */
    private async getUnconfirmedBalance(user: string): Promise<number> {
        const key = this.getBalanceKey('unconfirmed', user);
        return await kv.get<number>(key) ?? 0;
    }

    // get all balances
    getBalances() {
        // Create a new Map to store the final balances
        const pendingBalances = new Map(this.balances);

        // Apply pending transactions from the queue
        this.queue.forEach(tx => {
            // Deduct from sender
            const senderBalance = pendingBalances.get(tx.transfer.signer) ?? 0;
            pendingBalances.set(tx.transfer.signer, senderBalance - tx.transfer.amount);

            // Add to recipient
            const recipientBalance = pendingBalances.get(tx.transfer.to) ?? 0;
            pendingBalances.set(tx.transfer.to, recipientBalance + tx.transfer.amount);
        });

        return Object.fromEntries(pendingBalances);
    }

    /**
     * Get a user's complete balance information and emit balance event
     */
    async getBalance(user?: string, options?: BalanceOptions): Promise<Balance> {
        const address = user || this.signer;
        const [confirmed, unconfirmed] = await Promise.all([
            this.getConfirmedBalance(address),
            this.getUnconfirmedBalance(address)
        ]);

        const confirmedAmount = confirmed ?? 0;
        const unconfirmedAmount = unconfirmed ?? 0;

        const balance: Balance = {
            total: confirmedAmount + unconfirmedAmount
        };

        if (options?.includeConfirmed) {
            balance.confirmed = confirmedAmount;
        }

        if (options?.includeUnconfirmed) {
            balance.unconfirmed = unconfirmedAmount;
        }

        this.emitEvent({
            type: 'balance',
            contract: this.subnet,
            data: {
                from: address,
                balance,
                timestamp: Date.now()
            }
        });

        return balance;
    }

    /**
     * Process a deposit event
     * Updates both confirmed and unconfirmed balances
     */
    async processDepositEvent(user: string, amount: number): Promise<void> {
        const confirmedKey = this.getBalanceKey('confirmed', user);
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);

        const [currentConfirmed, currentUnconfirmed] = await Promise.all([
            kv.get<number>(confirmedKey),
            kv.get<number>(unconfirmedKey)
        ]);

        await Promise.all([
            kv.set(confirmedKey, (currentConfirmed ?? 0) + amount),
            kv.set(unconfirmedKey, (currentUnconfirmed ?? 0) + amount)
        ]);

        this.emitEvent({
            type: 'deposit',
            contract: this.subnet,
            data: {
                from: user,
                amount,
                status: 'completed',
                timestamp: Date.now()
            }
        });

        // Emit updated balance
        await this.getBalance(user);
    }

    /**
     * Process a withdrawal event
     * Updates both confirmed and unconfirmed balances
     */
    async processWithdrawEvent(user: string, amount: number): Promise<void> {
        const confirmedKey = this.getBalanceKey('confirmed', user);
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);

        const [currentConfirmed, currentUnconfirmed] = await Promise.all([
            kv.get<number>(confirmedKey),
            kv.get<number>(unconfirmedKey)
        ]);

        await Promise.all([
            kv.set(confirmedKey, (currentConfirmed ?? 0) - amount),
            kv.set(unconfirmedKey, (currentUnconfirmed ?? 0) - amount)
        ]);

        this.emitEvent({
            type: 'withdraw',
            contract: this.subnet,
            data: {
                to: user,
                amount,
                status: 'completed',
                timestamp: Date.now()
            }
        });

        // Emit updated balance
        await this.getBalance(user);
    }

    /**
     * Process a transfer event
     * Updates both confirmed and unconfirmed balances for sender and receiver
     */
    async processTransferEvent(from: string, to: string, amount: number, txid?: string): Promise<void> {
        // Get all balance keys
        const fromConfirmedKey = this.getBalanceKey('confirmed', from);
        const fromUnconfirmedKey = this.getBalanceKey('unconfirmed', from);
        const toConfirmedKey = this.getBalanceKey('confirmed', to);
        const toUnconfirmedKey = this.getBalanceKey('unconfirmed', to);

        // Get current balances
        const [fromConfirmed, fromUnconfirmed, toConfirmed, toUnconfirmed] = await Promise.all([
            kv.get<number>(fromConfirmedKey),
            kv.get<number>(fromUnconfirmedKey),
            kv.get<number>(toConfirmedKey),
            kv.get<number>(toUnconfirmedKey)
        ]);

        // Update all balances atomically
        await Promise.all([
            kv.set(fromConfirmedKey, (fromConfirmed ?? 0) - amount),
            kv.set(fromUnconfirmedKey, (fromUnconfirmed ?? 0) - amount),
            kv.set(toConfirmedKey, (toConfirmed ?? 0) + amount),
            kv.set(toUnconfirmedKey, (toUnconfirmed ?? 0) + amount)
        ]);

        // Emit transfer event
        this.emitEvent({
            type: 'transfer',
            contract: this.subnet,
            data: {
                from,
                to,
                amount,
                status: 'completed',
                txid,
                timestamp: Date.now()
            }
        });

        // Emit updated balances for both parties
        await Promise.all([
            this.getBalance(from),
            this.getBalance(to)
        ]);
    }

    /**
     * Update confirmed balance and emit event
     */
    async updateConfirmedBalance(userOrAmount: string | number, amount?: number): Promise<void> {
        if (typeof userOrAmount === 'number') {
            // Legacy support for old method signature
            await kv.set(this.getBalanceKey('confirmed'), userOrAmount);
            await this.getBalance();
        } else {
            await kv.set(this.getBalanceKey('confirmed', userOrAmount), amount!);
            await this.getBalance(userOrAmount);
        }
    }

    /**
     * Update unconfirmed balance and emit event
     */
    async updateUnconfirmedBalance(userOrAmount: string | number, amount?: number): Promise<void> {
        if (typeof userOrAmount === 'number') {
            // Legacy support for old method signature
            await kv.set(this.getBalanceKey('unconfirmed'), userOrAmount);
            await this.getBalance();
        } else {
            await kv.set(this.getBalanceKey('unconfirmed', userOrAmount), amount!);
            await this.getBalance(userOrAmount);
        }
    }

    private async executeTransaction(txOptions: any): Promise<TransactionResult> {
        if (!this.privateKey) {
            throw new Error('PRIVATE_KEY environment variable not set');
        }

        const transaction = await makeContractCall({
            ...txOptions,
            senderKey: this.privateKey,
            network: STACKS_MAINNET,
        });

        const response: TxBroadcastResult = await broadcastTransaction({
            transaction,
            network: STACKS_MAINNET,
        });

        if ('error' in response) throw new Error(response.error);
        return { txid: response.txid };
    }

    // async transfer(options: TransferOptions) {
    //     const nextNonce = Date.now();
    //     const tokens = options.amount;

    //     if (!this.privateKey) {
    //         throw new Error('PRIVATE_KEY environment variable not set');
    //     }

    //     const signature = await this.generateSignature({
    //         to: options.to,
    //         amount: tokens,
    //         nonce: nextNonce
    //     });

    //     const transfer: Transfer = {
    //         signature,
    //         signer: this.signer,
    //         to: options.to,
    //         amount: tokens,
    //         nonce: nextNonce,
    //     };

    //     this.emitEvent({
    //         type: 'transfer',
    //         contract: this.subnet,
    //         data: {
    //             from: this.signer,
    //             to: options.to,
    //             amount: tokens,
    //             status: 'pending',
    //             timestamp: Date.now()
    //         }
    //     });

    //     await this.addTransferToQueue(transfer);

    //     // Check if we should process the batch
    //     if (this.shouldProcessBatch()) {
    //         return this.processTransfers();
    //     }

    //     return { queued: true, queueSize: this.queue.length };
    // }

    private shouldProcessBatch(): boolean {
        // Add your batch processing logic here
        // For example, process when queue reaches certain size
        return this.queue.length >= 20;
    }

    /**
     * Apply an unconfirmed balance change immediately and emit event
     */
    private async applyUnconfirmedChange(user: string, amount: number, type: 'deposit' | 'withdraw' | 'transfer'): Promise<void> {
        const unconfirmedKey = this.getBalanceKey('unconfirmed', user);
        const currentUnconfirmed = await kv.get<number>(unconfirmedKey) ?? 0;

        // Update unconfirmed balance immediately
        await kv.set(unconfirmedKey, currentUnconfirmed + amount);

        // Emit balance update event immediately
        await this.getBalance(user);

        // Emit specific event type
        this.emitEvent({
            type,
            contract: this.subnet,
            data: {
                from: type === 'withdraw' ? undefined : user,
                to: type === 'withdraw' ? user : (type === 'transfer' ? undefined : undefined),
                amount: Math.abs(amount),
                status: 'processing',
                timestamp: Date.now()
            }
        });
    }

    public async processTxRequest(txRequest: Transfer) {
        // create a new Transaction object and put it in the queue
        const transaction = new Transaction(txRequest);
        this.queue.push(transaction);
    }

    public async settleTransactions(batchSize?: number) {
        // Don't process if queue is empty
        if (this.queue.length === 0) return;

        // Get contract details from subnet identifier (e.g. "ST1234.my-contract")
        const [contractAddress, contractName] = this.subnet.split('.');
        if (!contractAddress || !contractName) {
            throw new Error('Invalid contract format');
        }

        // NOTE: this is a potential future batch transaction format
        // const clarityOperations = this.queue.map(op => {
        //     return Cl.tuple({
        //         seal: Cl.tuple({
        //             signature: Cl.bufferFromHex(op.txRequest.signature),
        //             nonce: Cl.uint(op.txRequest.nonce),
        //         }),
        //         function: Cl.tuple({
        //             name: Cl.stringAscii(op.txRequest.function.name),
        //             args: Cl.list(op.txRequest.function.args.map(arg => Cl.stringAscii(arg))),
        //         }),
        //     });
        // });

        // const clarityOperations = this.queue.map(op => {
        //     return Cl.tuple({
        //         signature: Cl.bufferFromHex(op.transfer.signature),
        //         signer: Cl.principal(op.transfer.signer),
        //         to: Cl.principal(op.transfer.to),
        //         amount: Cl.uint(op.transfer.amount),
        //         nonce: Cl.uint(op.transfer.nonce),
        //     });
        // });

        // Get the transactions that will be settled
        // if no batch size is provided, settle oldest 200 transactions
        const txsToSettle = batchSize ? this.queue.splice(0, batchSize) : this.queue.splice(0, 200);

        // Apply balance changes from settled transactions
        for (const tx of txsToSettle) {
            // Deduct from sender
            const senderBalance = this.balances.get(tx.transfer.signer) || 0;
            this.balances.set(tx.transfer.signer, senderBalance - tx.transfer.amount);

            // Add to receiver
            const receiverBalance = this.balances.get(tx.transfer.to) || 0;
            this.balances.set(tx.transfer.to, receiverBalance + tx.transfer.amount);
        }

        // return {
        //     contractAddress,
        //     contractName,
        //     functionName: `batch-transfer`,
        //     functionArgs: [Cl.list(clarityOperations)],
        //     senderKey: this.privateKey!,
        //     network: STACKS_MAINNET,
        //     fee: 1800
        // };
    }

    // public async addTransferToQueue(transfer: Transfer): Promise<void> {
    //     // Validate transfer including signature verification
    //     await this.validateTransferOperation(transfer);

    //     // Verify balances
    //     const balances = await this.getBalance(transfer.signer);
    //     if ((balances.confirmed ?? 0) + (balances.unconfirmed ?? 0) < transfer.amount) {
    //         this.emitEvent({
    //             type: 'transfer',
    //             contract: this.subnet,
    //             data: {
    //                 from: transfer.signer,
    //                 to: transfer.to,
    //                 amount: transfer.amount,
    //                 status: 'failed',
    //                 error: 'Insufficient balance',
    //                 timestamp: Date.now()
    //             }
    //         });
    //         throw new Error('Insufficient balance');
    //     }

    //     // Apply unconfirmed changes immediately
    //     await Promise.all([
    //         this.applyUnconfirmedChange(transfer.signer, -transfer.amount, 'transfer'),
    //         this.applyUnconfirmedChange(transfer.to, transfer.amount, 'transfer')
    //     ]);

    //     // Add to queue
    //     this.queue.push(transfer);
    //     console.log('Added transfer to queue:', transfer);
    // }

    // public async processTransfers(): Promise<TransactionResult | void> {
    //     if (!this.privateKey) {
    //         throw new Error('PRIVATE_KEY environment variable not set');
    //     }

    //     const queueLength = this.queue.length;
    //     if (queueLength === 0) return;

    //     console.log('Processing transfers:', queueLength);

    //     this.emitEvent({
    //         type: 'batch',
    //         contract: this.subnet,
    //         data: {
    //             status: 'processing',
    //             timestamp: Date.now()
    //         }
    //     });

    //     try {
    //         await Promise.all(this.queue.map(transfer => this.validateTransferOperation(transfer)));

    //         const txOptions = this.buildBatchTransferTxOptions(this.queue);
    //         const result = await this.executeTransaction(txOptions);

    //         // Emit events for each transfer in the batch
    //         this.queue.forEach(transfer => {
    //             this.emitEvent({
    //                 type: 'transfer',
    //                 contract: this.subnet,
    //                 data: {
    //                     from: transfer.signer,
    //                     to: transfer.to,
    //                     amount: transfer.amount,
    //                     status: 'completed',
    //                     txid: result.txid,
    //                     timestamp: Date.now()
    //                 }
    //             });
    //         });

    //         // Clear the processed transfers from the queue
    //         this.queue.splice(0, queueLength);

    //         this.emitEvent({
    //             type: 'batch',
    //             contract: this.subnet,
    //             data: {
    //                 status: 'completed',
    //                 txid: result.txid,
    //                 timestamp: Date.now()
    //             }
    //         });

    //         return result;
    //     } catch (error) {
    //         console.error('Error processing transfers:', error);

    //         this.emitEvent({
    //             type: 'batch',
    //             contract: this.subnet,
    //             data: {
    //                 status: 'failed',
    //                 error: error instanceof Error ? error.message : 'Unknown error',
    //                 timestamp: Date.now()
    //             }
    //         });
    //         throw error;
    //     }
    // }

    async deposit(amount: number) {
        this.emitEvent({
            type: 'deposit',
            contract: this.subnet,
            data: {
                from: this.signer,
                amount,
                status: 'pending',
                timestamp: Date.now()
            }
        });

        try {
            // Apply unconfirmed change immediately
            await this.applyUnconfirmedChange(this.signer, amount, 'deposit');

            const txOptions = buildDepositTxOptions({
                signer: this.signer,
                subnet: this.subnet,
                amount,
            });

            const result = await this.executeTransaction(txOptions);

            this.emitEvent({
                type: 'deposit',
                contract: this.subnet,
                data: {
                    from: this.signer,
                    amount,
                    status: 'completed',
                    txid: result.txid,
                    timestamp: Date.now()
                }
            });

            return result;
        } catch (error) {
            this.emitEvent({
                type: 'deposit',
                contract: this.subnet,
                data: {
                    from: this.signer,
                    amount,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: Date.now()
                }
            });
            throw error;
        }
    }

    async withdraw(amount: number) {
        this.emitEvent({
            type: 'withdraw',
            contract: this.subnet,
            data: {
                to: this.signer,
                amount,
                status: 'pending',
                timestamp: Date.now()
            }
        });

        try {
            // Apply unconfirmed change immediately
            await this.applyUnconfirmedChange(this.signer, -amount, 'withdraw');

            const txOptions = buildWithdrawTxOptions({
                subnet: this.subnet,
                amount
            });

            const result = await this.executeTransaction(txOptions);

            this.emitEvent({
                type: 'withdraw',
                contract: this.subnet,
                data: {
                    to: this.signer,
                    amount,
                    status: 'completed',
                    txid: result.txid,
                    timestamp: Date.now()
                }
            });

            return result;
        } catch (error) {
            this.emitEvent({
                type: 'withdraw',
                contract: this.subnet,
                data: {
                    to: this.signer,
                    amount,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: Date.now()
                }
            });
            throw error;
        }
    }

    async generateSignature(message: BlazeMessage): Promise<string> {
        const domain = createBlazeDomain();
        const clarityMessage = createBlazeMessage(message);

        const signature = await signStructuredData({
            message: clarityMessage,
            domain,
            privateKey: this.privateKey!
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
        } catch (error) {
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

    buildBatchTransferTxOptions(operations: Transfer[]) {
        if (!this.subnet || !operations.length) {
            throw new Error('Invalid parameters for building batch transfer transaction');
        }

        const [contractAddress, contractName] = this.subnet.split('.');
        if (!contractAddress || !contractName) {
            throw new Error('Invalid contract format');
        }

        const clarityOperations = operations.map(op => {
            return Cl.tuple({
                signature: Cl.bufferFromHex(op.signature),
                signer: Cl.principal(op.signer),
                to: Cl.principal(op.to),
                amount: Cl.uint(op.amount),
                nonce: Cl.uint(op.nonce),
            });
        });

        return {
            contractAddress,
            contractName,
            functionName: 'batch-transfer',
            functionArgs: [Cl.list(clarityOperations)],
            senderKey: this.privateKey!,
            network: STACKS_MAINNET,
            fee: 1800
        };
    }
}

export class Transaction {
    constructor(public transfer: Transfer) {
        console.log('New transaction:', transfer);
    }

    // this transaction has a few important roles it plays

    // most importantly, it represents a possible future transaction
    // this is helpful because until transactions are processed, they are not valid
    // and until it is valid, we cant assume it will be added to a block
    // but we still want to show users any possible balances that they would have
    // if the transaction were to be added to a block

    // so while it remains in the queue, it is a promise of a future transaction
    // and we can use it to show users possible balances

    // secondly, it represents a transfer operation, so when we do process the queue
    // we can use this object to create a valid contract call to the batch-X function

    // each blaze-wrapped contract will have a different set of functions
    // but generally speaking, most public functions will have a public-<signed> counterpart
    // which is the function that is called when a user sends a tx to the contract

    // for example, fungible tokens will have a transfer-signed function
    // which will transfer the tokens from the signer to the recipient
    // a nft contract will have a transfer-signed function and a mint-signed function
    // a dex pool will have a swap-signed function and so on and so forth

    // so when we process the queue, we can use this object to create a valid contract call
    // to the batch-X function

    // this is important because it allows us to show users possible balances
    // and it allows us to process transactions in a safe and secure way

    // when transactions are processed, these objects are removed from the queue
    // so either they are removed from the queue and confirm on-chain, in which case
    // the users future balance settles to their confirmed balance (no visual change)
    // or its removed from the queue and does not confirm on-chain, in which case
    // the users future balance is updated to reflect the new unconfirmed balance

    // so in the case that a transaction fails, this removing from the queue is a natural
    // rollback mechanism, and the users future balance is updated to reflect the new unconfirmed balance

}