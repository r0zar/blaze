import { describe, it, expect } from 'vitest';
import { getFullBalance, processDepositEvent, processWithdrawEvent, Subnet, updateUnconfirmedBalance } from '../src';

describe('Balance', () => {
    const contract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
    const signer = 'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88';

    it('should get the balance of a user', async () => {
        const balance = await getFullBalance(contract, signer);
        console.log('Balance:', balance);
    });

    it('should reset a unconfirmed balance', async () => {
        await updateUnconfirmedBalance(contract, signer, 0);
        const balance = await getFullBalance(contract, signer);
        expect(balance.unconfirmed).toBe(0);
    });

    it('should process a deposit event', async () => {
        await processDepositEvent(contract, signer, 100);
        const balance = await getFullBalance(contract, signer);
        expect(balance.confirmed).toBe(100);
        expect(balance.unconfirmed).toBe(0);
    });

    it('should process a withdrawal event', async () => {
        await processWithdrawEvent(contract, signer, 100);
        const balance = await getFullBalance(contract, signer);
        expect(balance.confirmed).toBe(0);
        expect(balance.unconfirmed).toBe(0);
    });

});
