import { StacksClient } from './stacks-client';

export class SignetClient {
  // Base state cache (from blockchain)
  protected baseState: Map<string, Map<string, any>> = new Map();

  // Temporary intent queue (cleared on submission)
  protected pendingIntents: Array<{ intent: any; timestamp: number }> = [];

  // Track intents by state key
  protected intentsByStateKey: Map<string, Set<number>> = new Map();

  // Blockchain client
  protected blockchainClient: StacksClient;

  // Batching configuration
  protected batchSize: number;

  constructor(options: {
    apiKey: string;
    network: 'mainnet' | 'testnet';
    batchSize?: number;
    batchInterval?: number; // ms
    stateCacheTTL?: number; // ms
  }) {
    this.blockchainClient = StacksClient.getInstance(options);
    this.batchSize = options.batchSize || 200;
  }

  async processBatch(): Promise<void> {
    if (this.pendingIntents.length === 0) {
      return;
    }

    // Collect intents for this batch
    const batchSize = Math.min(this.batchSize, this.pendingIntents.length);
    const batch = this.pendingIntents.slice(0, batchSize);

    try {
      // Submit batch to blockchain
      await this.submitBatchToBlockchain(batch);

      // HERE IS THE KEY DIFFERENCE:
      // Remove processed intents immediately after submission
      // Don't wait for confirmation
      this.pendingIntents = this.pendingIntents.slice(batchSize);

      // Clean up state indices
      this.rebuildIntentIndices();
    } catch (error) {
      console.error('Failed to process batch:', error);
      // Note: In a real implementation, we might want to mark these
      // intents as failed or retry later
    }
  }

  // Internal methods
  createStateKey(contract: string, functionName: string, args: any[]): string {
    return `${contract}:${functionName}:${JSON.stringify(args)}`;
  }

  updateBaseState(contract: string, stateKey: string, value: any): void {
    let contractState = this.baseState.get(contract);
    if (!contractState) {
      contractState = new Map();
      this.baseState.set(contract, contractState);
    }

    contractState.set(stateKey, value);
  }

  trackIntentForStateKeys(intent: any, intentIndex: number): void {
    // Determine which state keys this intent would affect
    const affectedKeys = this.getAffectedStateKeys(intent);

    // Track this intent for each affected state key
    for (const key of affectedKeys) {
      let intents = this.intentsByStateKey.get(key);
      if (!intents) {
        intents = new Set();
        this.intentsByStateKey.set(key, intents);
      }
      intents.add(intentIndex);
    }
  }

  getAffectedStateKeys(intent: any): string[] {
    // Contract-specific logic to determine affected state
    const { contract, function: fn, args, sender } = intent;

    // Simple example for token transfer
    if (fn === 'transfer') {
      const [recipient] = args;

      return [
        this.createStateKey(contract, 'get-balance', [sender]),
        this.createStateKey(contract, 'get-balance', [recipient]),
      ];
    }

    // Default - assuming no effects
    return [];
  }

  async resolveVirtualState(
    contract: string,
    functionName: string,
    args: any[]
  ): Promise<any> {
    // Get base value (either from cache or blockchain)
    let baseValue: any;

    const stateKey = this.createStateKey(contract, functionName, args);
    const contractState = this.baseState.get(contract);

    if (contractState && contractState.has(stateKey)) {
      baseValue = contractState.get(stateKey);
    } else {
      try {
        // Fetch from blockchain
        baseValue = await this.blockchainClient.callReadOnly(
          contract,
          functionName,
          args
        );
        this.updateBaseState(contract, stateKey, baseValue);
      } catch (error) {
        console.error(`Error fetching base state:`, error);
        baseValue = null; // Default value if fetching fails
      }
    }

    // Apply pending intents
    const intentIndices = this.intentsByStateKey.get(stateKey) || new Set();
    if (intentIndices.size === 0) {
      return baseValue;
    }

    // Apply intents in timestamp order
    let currentValue = baseValue;
    const sortedIndices = Array.from(intentIndices).sort((a, b) => {
      return (
        this.pendingIntents[a].timestamp - this.pendingIntents[b].timestamp
      );
    });

    for (const index of sortedIndices) {
      const { intent } = this.pendingIntents[index];
      currentValue = this.applyIntentToValue(
        intent,
        functionName,
        args,
        currentValue
      );
    }

    return currentValue;
  }

  applyIntentToValue(
    intent: any,
    functionName: string,
    args: any[],
    currentValue: any
  ): any {
    // Apply intent effect to value (contract-specific logic)
    const { function: fn } = intent;

    // Example: handle balance query for transfer
    if (functionName === 'get-balance' && fn === 'transfer') {
      const queriedAddress = args[0];
      const [recipient, amount] = intent.args;
      const sender = intent.sender;

      let balance = Number(currentValue || 0);

      if (queriedAddress === sender) {
        balance -= Number(amount);
      }

      if (queriedAddress === recipient) {
        balance += Number(amount);
      }

      return balance.toString();
    }

    // Default - no change
    return currentValue;
  }

  async submitBatchToBlockchain(batch: any[]): Promise<string> {
    // In reality, this would submit transactions to the blockchain
    // For simplicity, just logging
    console.log(`Submitting batch of ${batch.length} intents to blockchain`);

    // Simulate blockchain submission
    return `tx_${Date.now()}`;
  }

  rebuildIntentIndices(): void {
    // Clear existing indices
    this.intentsByStateKey.clear();

    // Rebuild for remaining intents
    for (let i = 0; i < this.pendingIntents.length; i++) {
      this.trackIntentForStateKeys(this.pendingIntents[i].intent, i);
    }
  }

  validateIntent(intent: any): void {
    // Validate intent format, signature, etc.
    // Throw if invalid
    if (!intent) {
      throw new Error('Intent is required');
    }
  }
}
