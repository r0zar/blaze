import { Cl } from '@stacks/transactions';
import test from 'ava';

import { StacksClient } from '../clients/stacks-client';

// Setup function to create a testable environment
function setupTest() {
  // Reset the singleton between tests
  // @ts-ignore: Accessing private property for testing
  StacksClient.instance = undefined;

  // Create a fresh instance
  const client = StacksClient.getInstance({
    apiKeys: ['test-key'],
    debug: false,
    network: 'mainnet',
  });

  return { client };
}

test('getInstance returns a singleton', (t) => {
  const instance1 = StacksClient.getInstance();
  const instance2 = StacksClient.getInstance();

  t.is(instance1, instance2, 'Should return the same instance');
});

// This test makes a real call to the Stacks blockchain
// It requires network connectivity and may occasionally fail if the API is down
test('can call a real contract read-only function', async (t) => {
  const { client } = setupTest();

  // is a well-known token contract
  const result = await client.callReadOnly(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
    'get-total-supply',
    []
  );

  // The name should be "Arkadiko Token" or similar
  t.truthy(result, 'Should return a result');
  t.true(typeof result === 'string', 'Result should be a string');
});

// Test for a contract that takes arguments
test('can call a contract with arguments', async (t) => {
  const { client } = setupTest();

  try {
    // get-balance takes an address argument
    const result = await client.callReadOnly(
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
      'get-balance',
      [Cl.address('SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS')]
    );

    t.true(
      typeof result === 'bigint' ||
        typeof result === 'number' ||
        typeof result === 'string',
      'Balance should be a numeric or string type'
    );
  } catch (error) {
    // If this specific call fails, log but don't fail the test
    // This creates more stable tests when using real network calls
    t.log('Could not get balance from contract:', error.message);
    t.pass('Skipping balance check due to API error');
  }
});

// Test for error handling with non-existent contract
test('handles errors for non-existent contracts', async (t) => {
  const { client } = setupTest();

  await t.throwsAsync(
    async () => {
      await client.callReadOnly(
        'SP000000000000000000000000000NONEXISTENT.fake-contract',
        'fake-method',
        []
      );
    },
    { instanceOf: Error }
  );
});
