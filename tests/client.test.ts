import { describe, it } from 'vitest';
import { Blaze } from '../src/client';

describe('Blaze Client Read Functions', () => {
    const subnet = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-test-2';
    const signer = 'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88';
    const blaze = new Blaze(subnet, signer);

    it('should get balance', async () => {
        const balance = await blaze.getBalance();
        console.log('Balance:', balance);
    });

    // should make a real deposit
    // it('should make a real deposit', async () => {
    //     const tx = await blaze.deposit(100);
    //     console.log('Deposit:', tx);
    // });

    // // should make a real withdraw
    // it('should make a real withdraw', async () => {
    //     const tx = await blaze.withdraw(100);
    //     console.log('Withdraw:', tx);
    // });

    // // should make a real transfer
    // it('should make a real transfer', async () => {
    //     const tx = await blaze.transfer({ to: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS', amount: 100 });
    //     console.log('Transfer:', tx);
    // });
});