import { describe, test, expect } from 'vitest';
import { Subnet } from '../src';

describe('Signature Generation and Verification', () => {
    const contract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
    const signer = 'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88';
    const to = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS';
    const amount = 10;
    const nonce = Date.now();

    test('should generate and verify a valid signature', async () => {
        const subnet = new Subnet(contract);

        // Generate signature using structured data utilities
        const signature = subnet.signTransfer(to, amount, nonce);

        // Verify the signature directly using contract
        const result = await subnet.verifySignature({ signature, signer, to, amount, nonce });

        expect(result).toBe(true);
    });

    // should issue a single transfer
    test('should issue a single transfer', async () => {
        const subnet = new Subnet(contract);
        const signature = subnet.signTransfer(to, amount, nonce);
        const result = await subnet.verifySignature({ signature, signer, to, amount, nonce });
        expect(result).toBe(true);

        const transfer = await subnet.executeTransfer({ signature, signer, to, amount, nonce });
        console.log('Transfer result:', transfer);
    });

    // should process a batch of transfers
    test('should process a batch of transfers', async () => {
        const subnet = new Subnet(contract);
        const signature1 = subnet.signTransfer(to, amount, nonce);
        const signature2 = subnet.signTransfer(to, amount, nonce + 1);
        const transfers = [
            {
                signature: signature1,
                signer,
                to,
                amount,
                nonce,
            },
            {
                signature: signature2,
                signer,
                to,
                amount,
                nonce: nonce + 1,
            }
        ];

        // get subnet status
        const status = subnet.getStatus();
        console.log('Subnet status:', status);

        await subnet.addTransferToQueue(transfers[0]);
        await subnet.addTransferToQueue(transfers[1]);

        const result = await subnet.processTransfers();
        console.log('Result:', result);

        const balance = await subnet.getBalance(signer);
        console.log('Balance:', balance);
    });
}); 