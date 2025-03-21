// src/examples/nft-marketplace.ts
import { MessageSigner, UnifiedClient } from '../index';

// Define types for our NFT marketplace
interface NFTListing {
    id: string;
    tokenId: string;
    collection: string;
    owner: string;
    price: string;
    metadata: {
        name: string;
        description: string;
        imageUrl: string;
        attributes: Array<{ trait_type: string; value: string }>;
    };
    listingTime: number;
    expirationTime: number;
}

export class NFTMarketplace {
    private client: UnifiedClient;
    private currentUser: string;
    private marketplaceContract: string;

    constructor(options: {
        privateKey?: string;
        apiKey: string;
        marketplaceContract: string;
    }) {
        this.client = new UnifiedClient({
            privateKey: options.privateKey,
            apiKey: options.apiKey,
            cacheTTL: 120000, // 2 minute cache for marketplace listings
            debug: true
        });

        this.marketplaceContract = options.marketplaceContract;

        // Set current user address if private key provided
        if (options.privateKey) {
            // Need to import MessageSigner
            const signer = new MessageSigner(options.privateKey);
            this.currentUser = signer.getAddress();
        } else {
            this.currentUser = '';
        }
    }

    /**
     * Get active listings from the marketplace
     */
    async getActiveListings(limit: number = 20, offset: number = 0): Promise<NFTListing[]> {
        try {
            const listings = await this.client.call(
                this.marketplaceContract,
                'get-active-listings',
                [limit, offset]
            );

            return listings as NFTListing[];
        } catch (error) {
            console.error('Failed to get active listings:', error);
            return [];
        }
    }

    /**
     * Get a specific listing by ID
     */
    async getListing(listingId: string): Promise<NFTListing | null> {
        try {
            const listing = await this.client.call(
                this.marketplaceContract,
                'get-listing',
                [listingId]
            );

            return listing as NFTListing;
        } catch (error) {
            console.error(`Failed to get listing ${listingId}:`, error);
            return null;
        }
    }

    /**
     * Get listings owned by a specific user
     */
    async getUserListings(userAddress: string = ''): Promise<NFTListing[]> {
        const address = userAddress || this.currentUser;

        if (!address) {
            throw new Error('User address is required');
        }

        try {
            const listings = await this.client.call(
                this.marketplaceContract,
                'get-listings-by-owner',
                [address]
            );

            return listings as NFTListing[];
        } catch (error) {
            console.error(`Failed to get listings for user ${address}:`, error);
            return [];
        }
    }

    /**
     * Create a new listing
     */
    async createListing(
        nftContract: string,
        tokenId: string,
        price: string,
        expirationDays: number = 30
    ): Promise<{ txId: string }> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to create listings');
        }

        // Calculate expiration time (current time + days in ms)
        const expirationTime = Date.now() + (expirationDays * 24 * 60 * 60 * 1000);

        try {
            // First, we need to approve the marketplace contract to transfer the NFT
            const approveResult = await this.client.execute(
                nftContract,
                'approve',
                [this.marketplaceContract, tokenId]
            );

            if (approveResult.status === 'error') {
                throw new Error(`NFT approval failed: ${approveResult.error?.message}`);
            }

            // Wait a bit for the approval to be processed
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Now create the listing
            const result = await this.client.execute(
                this.marketplaceContract,
                'create-listing',
                [nftContract, tokenId, price, Math.floor(expirationTime / 1000)]
            );

            if (result.status === 'error') {
                throw new Error(`Listing creation failed: ${result.error?.message}`);
            }

            // Invalidate listings caches
            this.client.invalidate(
                this.marketplaceContract,
                'get-active-listings',
                []
            );

            this.client.invalidate(
                this.marketplaceContract,
                'get-listings-by-owner',
                [this.currentUser]
            );

            return { txId: result.txId! };
        } catch (error) {
            console.error('Failed to create listing:', error);
            throw error;
        }
    }

    /**
     * Purchase an NFT listing
     */
    async purchaseListing(listingId: string): Promise<{ txId: string }> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to purchase NFTs');
        }

        try {
            // First, get the listing to check its price
            const listing = await this.getListing(listingId);

            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            // Execute the purchase transaction
            const result = await this.client.execute(
                this.marketplaceContract,
                'purchase-listing',
                [listingId],
                {
                    // Attach the exact price as post condition
                    postConditions: [
                        {
                            principal: this.currentUser,
                            tokenAsset: { assetId: '0', contract: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token' }, // Example token contract
                            conditionCode: 'sent-less-than-or-equal',
                            amount: listing.price
                        }
                    ]
                }
            );

            if (result.status === 'error') {
                throw new Error(`Purchase failed: ${result.error?.message}`);
            }

            // Invalidate all related caches
            this.client.invalidate(
                this.marketplaceContract,
                'get-active-listings',
                []
            );

            this.client.invalidate(
                this.marketplaceContract,
                'get-listing',
                [listingId]
            );

            // Also invalidate the previous owner's listings
            this.client.invalidate(
                this.marketplaceContract,
                'get-listings-by-owner',
                [listing.owner]
            );

            return { txId: result.txId! };
        } catch (error) {
            console.error(`Failed to purchase listing ${listingId}:`, error);
            throw error;
        }
    }

    /**
     * Cancel a listing
     */
    async cancelListing(listingId: string): Promise<{ txId: string }> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to cancel listings');
        }

        try {
            const result = await this.client.execute(
                this.marketplaceContract,
                'cancel-listing',
                [listingId]
            );

            if (result.status === 'error') {
                throw new Error(`Cancellation failed: ${result.error?.message}`);
            }

            // Invalidate all related caches
            this.client.invalidate(
                this.marketplaceContract,
                'get-active-listings',
                []
            );

            this.client.invalidate(
                this.marketplaceContract,
                'get-listing',
                [listingId]
            );

            this.client.invalidate(
                this.marketplaceContract,
                'get-listings-by-owner',
                [this.currentUser]
            );

            return { txId: result.txId! };
        } catch (error) {
            console.error(`Failed to cancel listing ${listingId}:`, error);
            throw error;
        }
    }

    /**
     * Search for listings by name
     */
    async searchListings(query: string): Promise<NFTListing[]> {
        try {
            const results = await this.client.call(
                this.marketplaceContract,
                'search-listings',
                [query]
            );

            return results as NFTListing[];
        } catch (error) {
            console.error(`Search failed for query "${query}":`, error);
            return [];
        }
    }

    /**
     * Refresh the marketplace data
     */
    refreshMarketplace(): void {
        // Invalidate all listings caches
        this.client.invalidate(
            this.marketplaceContract,
            'get-active-listings',
            []
        );

        if (this.currentUser) {
            this.client.invalidate(
                this.marketplaceContract,
                'get-listings-by-owner',
                [this.currentUser]
            );
        }
    }
}

// Usage example
async function nftMarketplaceExample() {
    const marketplace = new NFTMarketplace({
        privateKey: 'your-private-key',
        apiKey: 'your-api-key',
        marketplaceContract: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.nft-marketplace'
    });

    try {
        // Get active listings
        const listings = await marketplace.getActiveListings(10);
        console.log('Active listings:', listings);

        // Create a new listing
        const { txId: listingTxId } = await marketplace.createListing(
            'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.my-nft-collection',
            '123',
            '1000000',
            7 // 7 day listing
        );
        console.log('Listing created with txId:', listingTxId);

        // Wait a bit for the listing to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Refresh marketplace data
        marketplace.refreshMarketplace();

        // Get user's listings
        const userListings = await marketplace.getUserListings();
        console.log('My listings:', userListings);

        // Purchase a listing (assuming we have a different wallet)
        if (listings.length > 0) {
            const buyerMarketplace = new NFTMarketplace({
                privateKey: 'buyer-private-key',
                apiKey: 'your-api-key',
                marketplaceContract: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.nft-marketplace'
            });

            const { txId: purchaseTxId } = await buyerMarketplace.purchaseListing(listings[0].id);
            console.log('Purchase completed with txId:', purchaseTxId);
        }
    } catch (error) {
        console.error('Marketplace operations failed:', error);
    }
}

nftMarketplaceExample()