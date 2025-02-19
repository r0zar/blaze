import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Blaze } from '../src';
import type { Balance } from '../src/shared/types';

describe('Blaze Balance Management', () => {
    const contract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
    const signer = 'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88';
    let blaze: Blaze;

    beforeEach(() => {
        console.log('Creating new Blaze instance...');
        blaze = new Blaze(contract, signer);
    });

    afterEach(() => {
        console.log('Test completed');
    });

    describe('getBalance', () => {
        it('should fetch initial balance', async () => {
            console.log('Fetching initial balance...');
            const balance = await blaze.getBalance();
            console.log('Received balance:', balance);
            expect(balance.total).toBeTypeOf('number');
        });

        it('should fetch detailed balance information', async () => {
            console.log('Fetching detailed balance...');
            const balance = await blaze.getBalance({
                includeConfirmed: true,
                includeUnconfirmed: true
            });
            console.log('Received detailed balance:', balance);
            expect(balance.total).toBeTypeOf('number');
            expect(balance.confirmed).toBeTypeOf('number');
            expect(balance.unconfirmed).toBeTypeOf('number');
            expect(balance.total).toBe((balance.confirmed ?? 0) + (balance.unconfirmed ?? 0));
        });

        it('should use cached balance when available', async () => {
            console.log('Testing balance caching...');

            // First call to get balance
            console.log('First balance fetch...');
            const firstBalance = await blaze.getBalance({
                includeConfirmed: true,
                includeUnconfirmed: true
            });
            console.log('First balance:', firstBalance);

            // Second immediate call should use cache
            console.log('Second balance fetch (should use cache)...');
            const secondBalance = await blaze.getBalance({
                includeConfirmed: true,
                includeUnconfirmed: true
            });
            console.log('Second balance:', secondBalance);

            expect(secondBalance).toEqual(firstBalance);
        });
    });
}); 