// src/examples/defi-wallet.ts
import { createL2Client, L2Service, MessageSigner, UnifiedClient } from '../index';

/**
 * Implementation of an L2 service for faster DeFi operations
 */
class DeFiL2Service implements L2Service {
    private cachedBalances: Map<string, Map<string, any>> = new Map();
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async query(contract: string, functionName: string, args: any[]): Promise<any> {
        // For balance queries, check our cache first
        if (functionName === 'get-balance' && args.length > 0) {
            const address = args[0];
            const contractBalances = this.cachedBalances.get(contract);

            if (contractBalances && contractBalances.has(address)) {
                return contractBalances.get(address);
            }
        }

        // Not in cache, query the L2 service
        try {
            const response = await fetch(`${this.baseUrl}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contract,
                    function: functionName,
                    args
                })
            });

            if (!response.ok) {
                throw new Error(`L2 service error: ${response.status}`);
            }

            const result = await response.json();

            // Cache balance results for future use
            if (functionName === 'get-balance' && args.length > 0) {
                const address = args[0];
                let contractBalances = this.cachedBalances.get(contract);

                if (!contractBalances) {
                    contractBalances = new Map();
                    this.cachedBalances.set(contract, contractBalances);
                }

                contractBalances.set(address, result);
            }

            return result;
        } catch (error) {
            console.error('L2 query failed:', error);
            return undefined; // Let it fall back to the blockchain
        }
    }

    async submit(intent: any): Promise<{ txId: string } | undefined> {
        try {
            const response = await fetch(`${this.baseUrl}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(intent)
            });

            if (!response.ok) {
                throw new Error(`L2 submission error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('L2 submission failed:', error);
            return undefined; // Let it fall back to the blockchain
        }
    }
}

// DeFi wallet class
export class DeFiWallet {
    private client: UnifiedClient;
    private address: string;

    constructor(options: {
        privateKey?: string;
        l2Endpoint?: string;
        apiKey: string;
    }) {
        // Create client with L2 service if endpoint provided
        if (options.l2Endpoint && options.privateKey) {
            const l2Service = new DeFiL2Service(options.l2Endpoint);
            this.client = createL2Client({
                privateKey: options.privateKey,
                l2Service,
                apiKey: options.apiKey,
                cacheTTL: 30000, // 30 second cache for balances
                debug: true
            });
        } else {
            // Read-only client if no private key
            this.client = new UnifiedClient({
                privateKey: options.privateKey,
                apiKey: options.apiKey,
                cacheTTL: 60000, // 1 minute cache
                debug: true
            });
        }

        // Get wallet address if private key provided
        if (options.privateKey) {
            // Need to import MessageSigner;
            const signer = new MessageSigner(options.privateKey);
            this.address = signer.getAddress();
        } else {
            this.address = '';
        }
    }

    /**
     * Get the balance of a token for the current wallet
     */
    async getTokenBalance(tokenContract: string): Promise<number> {
        try {
            if (!this.address) {
                throw new Error('No wallet address available');
            }

            const balance = await this.client.call(
                tokenContract,
                'get-balance',
                [this.address]
            );

            return balance;
        } catch (error) {
            console.error(`Failed to get balance for ${tokenContract}:`, error);
            return 0;
        }
    }

    /**
     * Get token information
     */
    async getTokenInfo(tokenContract: string): Promise<{
        name: string;
        symbol: string;
        decimals: number;
        totalSupply: number;
    }> {
        try {
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                this.client.call(tokenContract, 'get-name', []),
                this.client.call(tokenContract, 'get-symbol', []),
                this.client.call(tokenContract, 'get-decimals', []),
                this.client.call(tokenContract, 'get-total-supply', [])
            ]);

            return {
                name,
                symbol,
                decimals: Number(decimals),
                totalSupply: Number(totalSupply)
            };
        } catch (error) {
            console.error(`Failed to get token info for ${tokenContract}:`, error);
            throw new Error(`Could not retrieve token information: ${error.message}`);
        }
    }

    /**
     * Transfer tokens to another address
     */
    async transfer(
        tokenContract: string,
        recipient: string,
        amount: number,
        memo?: string
    ): Promise<{ txId: string }> {
        if (!this.address) {
            throw new Error('No wallet address available');
        }

        // Create post conditions to prevent overspending
        const postConditions = [
            {
                principal: this.address,
                tokenAsset: { assetId: '0', contract: tokenContract },
                conditionCode: 'sent-less-than-or-equal',
                amount: amount
            }
        ];

        // Execute the transfer
        const result = await this.client.execute(
            tokenContract,
            'transfer',
            [
                this.address,  // sender
                recipient,     // recipient 
                amount.toString(),  // amount
                memo ? memo : '' // optional memo
            ],
            { postConditions }
        );

        if (result.status === 'error') {
            throw new Error(`Transfer failed: ${result.error?.message}`);
        }

        // Invalidate balance cache for sender and recipient
        this.client.invalidate(tokenContract, 'get-balance', [this.address]);
        this.client.invalidate(tokenContract, 'get-balance', [recipient]);

        return { txId: result.txId! };
    }

    /**
     * Get all token balances for a list of tokens
     */
    async getAllBalances(tokenContracts: string[]): Promise<Map<string, number>> {
        const balances = new Map<string, number>();

        // Use Promise.all to fetch all balances in parallel
        const results = await Promise.all(
            tokenContracts.map(async (contract) => {
                try {
                    const balance = await this.getTokenBalance(contract);
                    return { contract, balance };
                } catch (error) {
                    console.error(`Error fetching balance for ${contract}:`, error);
                    return { contract, balance: 0 };
                }
            })
        );

        // Populate the balances map
        for (const { contract, balance } of results) {
            balances.set(contract, balance);
        }

        return balances;
    }

    /**
     * Refresh cached balances
     */
    refreshBalances(tokenContracts: string[]): void {
        for (const contract of tokenContracts) {
            this.client.invalidate(contract, 'get-balance', [this.address]);
        }
    }

    /**
     * Get transaction status
     */
    async getTransactionStatus(txId: string): Promise<'pending' | 'success' | 'failed'> {
        try {
            // This would call a transaction status endpoint
            const response = await fetch(`https://stacks-api.example.com/tx/${txId}`);
            const data = await response.json();

            if (data.tx_status === 'success') return 'success';
            if (data.tx_status === 'failed') return 'failed';
            return 'pending';
        } catch (error) {
            console.error('Failed to get transaction status:', error);
            return 'pending';
        }
    }
}

// Usage example
async function defiWalletExample() {
    const wallet = new DeFiWallet({
        privateKey: 'your-private-key',
        l2Endpoint: 'https://l2.example.com/api',
        apiKey: 'your-api-key'
    });

    // Get token info
    const tokenInfo = await wallet.getTokenInfo('SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token');
    console.log('Token Info:', tokenInfo);

    // Get token balance
    const balance = await wallet.getTokenBalance('SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token');
    console.log('Balance:', balance.toString());

    // Transfer tokens
    try {
        const { txId } = await wallet.transfer(
            'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token',
            'ST3KCNDSWZSFZCC6BE4VA9AXWXC9KEB16FBTRK36T',
            100,
            'Testing transfer'
        );
        console.log('Transfer submitted with txId:', txId);

        // Poll for transaction status
        let status = 'pending';
        while (status === 'pending') {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            status = await wallet.getTransactionStatus(txId);
            console.log('Transaction status:', status);
        }
    } catch (error) {
        console.error('Transfer failed:', error);
    }
}

defiWalletExample()