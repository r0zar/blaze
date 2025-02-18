// should create a real deposit and withdraw
import { describe, it } from 'vitest';
import { Blaze } from '../src';

const contract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
const signer = 'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88';

describe('Blaze Client', () => {
    it('should create a real deposit', async () => {
        const client = new Blaze(contract, signer);
        // const result = await client.deposit(100);
        // console.log('Deposit result:', result);
    });

    it('should create a real withdraw', async () => {
        const client = new Blaze(contract, signer);
        // const result = await client.withdraw(100);
        // console.log('Withdraw result:', result);
    });
});