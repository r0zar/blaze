// src/examples/social-media.ts
import { MessageSigner, UnifiedClient } from '../index';

// Define types for our social media data
interface Profile {
    username: string;
    displayName: string;
    bio: string;
    avatar: string;
    following: number;
    followers: number;
}

interface Post {
    id: string;
    author: string;
    content: string;
    timestamp: number;
    likes: number;
    replies: number;
}

export class SocialMediaApp {
    private client: UnifiedClient;
    private currentUser: string;

    constructor(options: {
        privateKey?: string;
        apiKey: string;
    }) {
        this.client = new UnifiedClient({
            privateKey: options.privateKey,
            apiKey: options.apiKey,
            cacheTTL: 60000, // 1 minute cache for social media content
            debug: true
        });

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
     * Get a user profile
     */
    async getProfile(username: string): Promise<Profile> {
        try {
            const profile = await this.client.call(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-profile',
                [username]
            );

            return profile as Profile;
        } catch (error) {
            console.error(`Failed to get profile for ${username}:`, error);
            throw new Error(`Could not retrieve profile: ${error.message}`);
        }
    }

    /**
     * Get posts by a user
     */
    async getUserPosts(username: string, limit: number = 10): Promise<Post[]> {
        try {
            const posts = await this.client.call(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-posts-by-user',
                [username, limit]
            );

            return posts as Post[];
        } catch (error) {
            console.error(`Failed to get posts for ${username}:`, error);
            return [];
        }
    }

    /**
     * Get a feed of posts
     */
    async getFeed(limit: number = 20): Promise<Post[]> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to view feed');
        }

        try {
            const feed = await this.client.call(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-feed',
                [this.currentUser, limit]
            );

            return feed as Post[];
        } catch (error) {
            console.error('Failed to get feed:', error);
            return [];
        }
    }

    /**
     * Create a new post
     */
    async createPost(content: string): Promise<{ txId: string }> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to create posts');
        }

        if (content.length > 280) {
            throw new Error('Post content exceeds maximum length of 280 characters');
        }

        try {
            const result = await this.client.execute(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'create-post',
                [content]
            );

            if (result.status === 'error') {
                throw new Error(`Post creation failed: ${result.error?.message}`);
            }

            // Invalidate user posts cache
            this.client.invalidate(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-posts-by-user',
                [this.currentUser]
            );

            return { txId: result.txId! };
        } catch (error) {
            console.error('Failed to create post:', error);
            throw error;
        }
    }

    /**
     * Like a post
     */
    async likePost(postId: string): Promise<{ txId: string }> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to like posts');
        }

        try {
            const result = await this.client.execute(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'like-post',
                [postId]
            );

            if (result.status === 'error') {
                throw new Error(`Like operation failed: ${result.error?.message}`);
            }

            // Invalidate feed cache since it contains the post that was liked
            this.client.invalidate(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-feed',
                [this.currentUser]
            );

            return { txId: result.txId! };
        } catch (error) {
            console.error(`Failed to like post ${postId}:`, error);
            throw error;
        }
    }

    /**
     * Follow a user
     */
    async followUser(username: string): Promise<{ txId: string }> {
        if (!this.currentUser) {
            throw new Error('User must be logged in to follow others');
        }

        try {
            const result = await this.client.execute(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'follow-user',
                [username]
            );

            if (result.status === 'error') {
                throw new Error(`Follow operation failed: ${result.error?.message}`);
            }

            // Invalidate profile caches for both users
            this.client.invalidate(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-profile',
                [username]
            );

            this.client.invalidate(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-profile',
                [this.currentUser]
            );

            return { txId: result.txId! };
        } catch (error) {
            console.error(`Failed to follow user ${username}:`, error);
            throw error;
        }
    }

    /**
     * Refresh the feed
     */
    refreshFeed(): void {
        if (this.currentUser) {
            this.client.invalidate(
                'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social',
                'get-feed',
                [this.currentUser]
            );
        }
    }
}

// Usage example
async function socialMediaExample() {
    const socialApp = new SocialMediaApp({
        privateKey: 'your-private-key',
        apiKey: 'your-api-key'
    });

    try {
        // Get profile
        const profile = await socialApp.getProfile('satoshi');
        console.log('Profile:', profile);

        // Get user posts
        const posts = await socialApp.getUserPosts('satoshi', 5);
        console.log('Posts:', posts);

        // Create a post
        const { txId } = await socialApp.createPost('Just published a new paper on peer-to-peer electronic cash!');
        console.log('Post created with txId:', txId);

        // Get feed (after a short delay to allow transaction to process)
        await new Promise(resolve => setTimeout(resolve, 2000));
        socialApp.refreshFeed();
        const feed = await socialApp.getFeed();
        console.log('Updated feed:', feed);

        // Follow a user
        const followResult = await socialApp.followUser('vitalik');
        console.log('Follow result:', followResult);
    } catch (error) {
        console.error('Social media operations failed:', error);
    }
}

socialMediaExample()