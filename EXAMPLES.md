```typescript
// Example 1: Basic Token Wallet
import { Blaze } from 'blaze-sdk';

async function createTokenWallet() {
  // Initialize Blaze client
  const wallet = new Blaze({
    privateKey: 'your-private-key',
    apiKey: 'your-api-key'
  });

  // Define token contract
  const tokenContract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract';
  
  // Get wallet address from private key
  const myAddress = wallet.getAddress();
  
  // Query token balance
  const balance = await wallet.call(
    tokenContract,
    'get-balance',
    [myAddress]
  );
  
  console.log(`Token balance: ${balance}`);
  
  // Execute a transfer
  const recipient = 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE';
  const amount = 100;
  
  try {
    const result = await wallet.execute(
      tokenContract,
      'transfer',
      [recipient, amount, 'Payment for services']
    );
    
    console.log(`Transaction submitted: ${result.txId}`);
    
    // Invalidate balance cache after transfer
    wallet.invalidate(tokenContract, 'get-balance', [myAddress]);
    wallet.invalidate(tokenContract, 'get-balance', [recipient]);
  } catch (error) {
    console.error('Transfer failed:', error.message);
  }
}

// Example 2: NFT Marketplace Integration
import { createL2Client } from 'blaze-sdk';

async function nftMarketplace() {
  // Initialize with L2 for faster responses
  const client = createL2Client({
    privateKey: 'your-private-key',
    l2Url: 'https://l2.example.com/api',
    apiKey: 'your-api-key'
  });
  
  const marketplaceContract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.nft-marketplace';
  const nftContract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.my-nft-collection';
  
  // Get active listings
  const listings = await client.call(
    marketplaceContract,
    'get-active-listings',
    [10] // limit to 10 listings
  );
  
  console.log('Active listings:', listings);
  
  // Create a new listing
  const tokenId = '123';
  const price = '1000000';
  const expirationDays = 7;
  
  try {
    // First, approve the marketplace contract to transfer the NFT
    await client.execute(
      nftContract,
      'approve',
      [marketplaceContract, tokenId]
    );
    
    // Create the listing
    const result = await client.execute(
      marketplaceContract,
      'create-listing',
      [nftContract, tokenId, price, expirationDays]
    );
    
    console.log(`Listing created with txId: ${result.txId}`);
  } catch (error) {
    console.error('Failed to create listing:', error.message);
  }
}

// Example 3: Custom Data Source
import { createService, Blaze } from 'blaze-sdk';

// Create an in-memory database service
function createInMemoryService() {
  // Simple in-memory database
  const db = {
    balances: {
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS': 1000000,
      'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE': 500000
    },
    transfers: []
  };
  
  // Create the service
  return createService({
    name: 'memory-db',
    
    queryFn: async (intent) => {
      // Handle different query types
      if (intent.contract === 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract') {
        if (intent.function === 'get-balance') {
          const address = intent.args[0];
          return db.balances[address] || 0;
        }
      }
      
      // Unknown query
      return undefined;
    },
    
    mutateFn: async (intent) => {
      // Handle different mutation types
      if (intent.contract === 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract') {
        if (intent.function === 'transfer') {
          const [recipient, amount] = intent.args;
          
          // Update balances
          db.balances[intent.sender] -= Number(amount);
          db.balances[recipient] = (db.balances[recipient] || 0) + Number(amount);
          
          // Record transfer
          const txId = `tx_${Date.now()}`;
          db.transfers.push({
            txId,
            sender: intent.sender,
            recipient,
            amount,
            timestamp: intent.timestamp
          });
          
          return { txId };
        }
      }
      
      // Unknown mutation
      return undefined;
    },
    
    debug: true
  });
}

async function useCustomService() {
  // Create the custom service
  const memoryService = createInMemoryService();
  
  // Create client with custom service and blockchain fallback
  const client = new Blaze({
    privateKey: 'your-private-key',
    services: [
      memoryService,
      // Blockchain will be used if memory service doesn't have the data
    ],
    apiKey: 'your-api-key'
  });
  
  // Use the client normally - it will use the memory service first
  const balance = await client.call(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
    'get-balance',
    ['SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS']
  );
  
  console.log(`Balance from memory service: ${balance}`);
  
  // Execute a transfer (will be handled by the memory service)
  const result = await client.execute(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
    'transfer',
    ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', 100, 'Test transfer']
  );
  
  console.log(`Transfer processed with txId: ${result.txId}`);
}

// Example 4: Advanced Intent Usage
import { Blaze } from 'blaze-sdk';

async function advancedIntents() {
  const client = new Blaze({
    privateKey: 'your-private-key',
    apiKey: 'your-api-key'
  });
  
  // Create a query intent directly
  const queryIntent = client.createQueryIntent(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
    'get-balance',
    ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
  );
  
  // Process the query intent
  const queryResult = await client.query(queryIntent);
  console.log(`Query status: ${queryResult.status}`);
  console.log(`Query data: ${queryResult.data}`);
  
  // Create a mutate intent directly
  const mutateIntent = await client.createMutateIntent(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
    'transfer',
    ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', 1000, 'Direct intent example'],
    {
      postConditions: [
        {
          principal: client.getAddress(),
          tokenAsset: { 
            assetId: '0', 
            contract: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract' 
          },
          conditionCode: 'sent-less-than-or-equal',
          amount: 1000
        }
      ]
    }
  );
  
  // Process the mutate intent
  const mutateResult = await client.mutate(mutateIntent);
  console.log(`Mutation status: ${mutateResult.status}`);
  console.log(`Transaction ID: ${mutateResult.txId}`);
}
```