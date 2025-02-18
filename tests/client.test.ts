import { describe, it } from 'vitest';
import { Blaze } from '../src/client';

describe('Blaze Client Read Functions', () => {
    const subnet = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-test-2';
    const userAddress = 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9';
    const blaze = new Blaze(subnet, userAddress);

    it('should get balance', async () => {
        const balance = await blaze.getBalance();
        console.log('Balance:', balance);
    });
});