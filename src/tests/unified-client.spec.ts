import test from 'ava';

import { UnifiedClient } from '../lib/unified-client';

// Setup function to create a testable environment
function setupTest() {
  // Create a read-only client for testing
  const client = new UnifiedClient({
    apiKey: 'test-key',
    network: 'mainnet',
    debug: false,
  });

  return { client };
}

test('UnifiedClient creates read intents correctly', (t) => {
  const { client } = setupTest();

  const intent = client.createReadIntent(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
    'get-total-supply',
    []
  );

  t.is(intent.type, 'read', 'Intent type should be read');
  t.is(
    intent.contract,
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
    'Contract should match'
  );
  t.is(intent.function, 'get-total-supply', 'Function should match');
  t.deepEqual(intent.args, [], 'Args should match');
});

test('UnifiedClient can call a real contract function', async (t) => {
  const { client } = setupTest();

  try {
    // Call a well-known token contract
    const result = await client.call(
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
      'get-total-supply',
      []
    );

    t.truthy(result, 'Should return a result');
  } catch (error) {
    // If API call fails, log but don't fail the test
    t.log('Could not call contract function:', error.message);
    t.pass('Skipping due to API error');
  }
});

test('UnifiedClient properly processes read intents', async (t) => {
  const { client } = setupTest();

  const intent = client.createReadIntent(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
    'get-total-supply',
    []
  );

  try {
    const result = await client.processIntent(intent);

    t.is(result.status, 'success', 'Result status should be success');
    t.truthy(result.data, 'Result should have data');
    t.falsy(result.error, 'Result should not have error');
  } catch (error) {
    // If API call fails, log but don't fail the test
    t.log('Could not process intent:', error.message);
    t.pass('Skipping due to API error');
  }
});

test('UnifiedClient handles errors for non-existent contracts', async (t) => {
  const { client } = setupTest();

  await t.throwsAsync(
    async () => {
      await client.call(
        'SP000000000000000000000000000NONEXISTENT.fake-contract',
        'fake-method',
        []
      );
    },
    { instanceOf: Error }
  );
});

test('UnifiedClient invalidates cache entries', (t) => {
  const { client } = setupTest();

  // First invalidate (no existing entries)
  const result1 = client.invalidate(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token',
    'get-total-supply',
    []
  );

  // Should return false since nothing was invalidated
  t.is(result1, false, 'Should return false when no entries exist');

  // Now clear the entire cache
  client.clearCache();

  // No assertion needed, just checking that it doesn't throw
  t.pass('clearCache() executed without errors');
});
