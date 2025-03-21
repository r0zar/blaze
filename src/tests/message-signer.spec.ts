import test from 'ava';

import { MessageSigner } from '../lib/message-signer';

// Test private key (don't use this in production!)
const TEST_PRIVATE_KEY =
    'e494f188c2d35887531ba474c433b1e41fadd8eb824aca983447fd4bb8b277d801';

test('MessageSigner derives address from private key', (t) => {
    const signer = new MessageSigner(TEST_PRIVATE_KEY);
    const address = signer.getAddress();

    t.truthy(address, 'Should return an address');
    t.true(address.startsWith('SP'), 'Mainnet address should start with SP');
});

test('MessageSigner throws when no private key is provided', (t) => {
    const signer = new MessageSigner();

    t.throws(
        () => {
            signer.getAddress();
        },
        { message: /No private key provided/ }
    );

    t.throws(
        () => {
            signer.signMessage({
                contract: 'test-contract',
                function: 'test-function',
                args: [],
                sender: 'test-sender',
                nonce: 1,
                timestamp: Date.now(),
            });
        },
        { message: /No private key provided/ }
    );
});

test('MessageSigner can sign a message', async (t) => {
    const signer = new MessageSigner(TEST_PRIVATE_KEY);

    const signature = await signer.signMessage({
        contract: 'test-contract',
        function: 'test-function',
        args: [],
        sender: 'test-sender',
    });

    t.truthy(signature, 'Should return a signature');
    t.true(signature.length > 0, 'Signature should not be empty');
});

test('MessageSigner can set a new private key', (t) => {
    const signer = new MessageSigner();

    // Initially should have no address
    t.throws(
        () => {
            signer.getAddress();
        },
        { message: /No private key provided/ }
    );

    // Set a private key
    signer.setPrivateKey(TEST_PRIVATE_KEY);

    // Now should have an address
    const address = signer.getAddress();
    t.truthy(address, 'Should return an address after setting private key');
});
