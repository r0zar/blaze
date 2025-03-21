import test from 'ava';

import { ReadIntent } from '../lib/intent-interfaces';
import { MemoryCacheProcessor } from '../lib/memory-cache-processor';

// Setup function to create a testable environment
function setupTest(ttl = 1000) {
  // Default 1 second TTL for faster testing
  const cache = new MemoryCacheProcessor({
    cacheTTL: ttl,
    debug: false,
  });

  return { cache };
}

test('MemoryCacheProcessor caches values properly', (t) => {
  const { cache } = setupTest();

  // Add a value to the cache
  cache.updateCache(
    'test-contract',
    'test-function',
    ['arg1', 'arg2'],
    'test-value'
  );

  // Create a matching intent
  const intent: ReadIntent = {
    type: 'read',
    contract: 'test-contract',
    function: 'test-function',
    args: ['arg1', 'arg2'],
  };

  // Process the intent and check the result
  return cache.processIntent(intent).then((result) => {
    t.is(result.status, 'success', 'Result status should be success');
    t.is(result.data, 'test-value', 'Result data should match cached value');
  });
});

test('MemoryCacheProcessor returns cache miss for non-existent entries', async (t) => {
  const { cache } = setupTest();

  // Create an intent for which we don't have a cached value
  const intent: ReadIntent = {
    type: 'read',
    contract: 'unknown-contract',
    function: 'unknown-function',
    args: [],
  };

  // Process the intent and check the result
  const result = await cache.processIntent(intent);
  t.is(result.status, 'error', 'Result status should be error');
  t.truthy(result.error, 'Result should have an error');
  t.true(
    result.error.message.includes('Cache miss'),
    'Error should indicate cache miss'
  );
});

test('MemoryCacheProcessor respects TTL', async (t) => {
  // Use a very short TTL
  const { cache } = setupTest(100); // 100ms TTL

  // Add a value to the cache
  cache.updateCache('test-contract', 'test-function', [], 'test-value');

  // Create a matching intent
  const intent: ReadIntent = {
    type: 'read',
    contract: 'test-contract',
    function: 'test-function',
    args: [],
  };

  // First check should find the value
  const result1 = await cache.processIntent(intent);
  t.is(result1.status, 'success', 'Initial result status should be success');

  // Wait for the TTL to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Second check should be a cache miss
  const result2 = await cache.processIntent(intent);
  t.is(result2.status, 'error', 'Result after TTL should be error');
  t.true(
    result2.error.message.includes('Cache miss'),
    'Error should indicate cache miss'
  );
});

test('MemoryCacheProcessor clears all cache entries', async (t) => {
  const { cache } = setupTest();

  // Add several values to the cache
  cache.updateCache('contract1', 'function1', [], 'value1');
  cache.updateCache('contract2', 'function1', [], 'value2');

  // Get cache stats before clearing
  const statsBefore = cache.getCacheStats();
  t.is(statsBefore.size, 2, 'Cache should have 2 entries before clearing');

  // Clear the cache
  cache.clearCache();

  // Get cache stats after clearing
  const statsAfter = cache.getCacheStats();
  t.is(statsAfter.size, 0, 'Cache should have 0 entries after clearing');

  // Try to retrieve a previously cached value
  const intent: ReadIntent = {
    type: 'read',
    contract: 'contract1',
    function: 'function1',
    args: [],
  };

  const result = await cache.processIntent(intent);
  t.is(
    result.status,
    'error',
    'Result status should be error after cache clear'
  );
});

test('MemoryCacheProcessor handles write intents', async (t) => {
  const { cache } = setupTest();

  // Try to process a write intent
  const result = await cache.processIntent({
    type: 'write',
    contract: 'test-contract',
    function: 'test-function',
    args: [],
    sender: 'test-sender',
    signature: 'test-signature',
    nonce: 1,
    timestamp: Date.now(),
  });

  // Cache should reject write intents
  t.is(result.status, 'error', 'Write intent should return error');
  t.true(
    result.error.message.includes('only supports read intents'),
    'Error should indicate write operations are not supported'
  );
});
