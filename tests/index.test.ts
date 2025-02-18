import { describe, it } from 'vitest';
import { Subnet } from '../src/index';

describe('Subnet Read Functions', () => {
    const contract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
    const userAddress = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS';
    const subnet = new Subnet(contract);

    it('should get contract balance', async () => {
        const balance = await subnet.getBalance(userAddress);
        console.log('Contract Balance:', balance);
    });

    it('should get node status', () => {
        const status = subnet.getStatus();
        console.log('Node Status:', status);
    });
});