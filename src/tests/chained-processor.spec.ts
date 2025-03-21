import test from 'ava';

import { ChainedProcessor } from '../lib/chained-processor';
import {
  AnyIntent,
  IntentProcessor,
  IntentResult,
} from '../lib/intent-interfaces';
import { MemoryCacheProcessor } from '../lib/memory-cache-processor';

// Simple stub processor for testing
class StubProcessor implements IntentProcessor {
  public callCount = 0;
  public shouldSucceed: boolean;
  public returnValue: any;

  constructor(shouldSucceed = true, returnValue: any = 'test-value') {
    this.shouldSucceed = shouldSucceed;
    this.returnValue = returnValue;
  }

  async processIntent(intent: AnyIntent): Promise<IntentResult> {
    console.log('Processing intent:', intent);
    this.callCount++;

    if (this.shouldSucceed) {
      return {
        status: 'success',
        data: this.returnValue,
      };
    } else {
      return {
        status: 'error',
        error: {
          message: 'Stub processor error',
        },
      };
    }
  }
}

// Setup function to create a testable environment
function setupTest() {
  const successProcessor = new StubProcessor(true, 'success-value');
  const failureProcessor = new StubProcessor(false);
  const cache = new MemoryCacheProcessor({ cacheTTL: 1000 }); // 1 second TTL

  // Create a chained processor with our test processors
  const processor = new ChainedProcessor({
    processors: [failureProcessor, successProcessor],
    cache,
    debug: false,
  });

  return { processor, successProcessor, failureProcessor, cache };
}

test('ChainedProcessor requires at least one processor', (t) => {
  t.throws(
    () => {
      new ChainedProcessor({
        processors: [],
      });
    },
    { message: /requires at least one processor/ }
  );
});

test('ChainedProcessor chains to next processor on failure', async (t) => {
  const { processor, successProcessor, failureProcessor } = setupTest();

  // Create a test intent
  const intent: AnyIntent = {
    type: 'read',
    contract: 'test-contract',
    function: 'test-function',
    args: [],
  };

  // Process the intent
  const result = await processor.processIntent(intent);

  // Check that both processors were called
  t.is(failureProcessor.callCount, 1, 'Failure processor should be called');
  t.is(successProcessor.callCount, 1, 'Success processor should be called');

  // Check the result
  t.is(result.status, 'success', 'Result status should be success');
  t.is(result.data, 'success-value', 'Result data should match');
});

test('ChainedProcessor uses cache for read operations', async (t) => {
  const { processor, successProcessor } = setupTest();

  // Create a test intent
  const intent: AnyIntent = {
    type: 'read',
    contract: 'test-contract',
    function: 'test-function',
    args: [],
  };

  // Process the intent the first time
  await processor.processIntent(intent);

  // Reset the call count
  successProcessor.callCount = 0;

  // Process the same intent again
  const cachedResult = await processor.processIntent(intent);

  // Success processor should not be called because result was cached
  t.is(
    successProcessor.callCount,
    0,
    'Success processor should not be called for cached result'
  );

  // Result should still be correct
  t.is(
    cachedResult.status,
    'success',
    'Cached result status should be success'
  );
  t.is(cachedResult.data, 'success-value', 'Cached result data should match');
});

test('ChainedProcessor resolveState works as expected', async (t) => {
  const { processor } = setupTest();

  // Use the legacy resolveState method
  const result = await processor.resolveState(
    'test-contract',
    'test-function',
    []
  );

  // Check the result
  t.is(
    result,
    'success-value',
    'resolveState should return the expected value'
  );
});

test('ChainedProcessor handles all processors failing', async (t) => {
  // Setup with only failing processors
  const failProcessor1 = new StubProcessor(false);
  const failProcessor2 = new StubProcessor(false);

  const processor = new ChainedProcessor({
    processors: [failProcessor1, failProcessor2],
    debug: false,
  });

  // Create a test intent
  const intent: AnyIntent = {
    type: 'read',
    contract: 'test-contract',
    function: 'test-function',
    args: [],
  };

  // Process should return the last error
  const result = await processor.processIntent(intent);

  // Check result
  t.is(result.status, 'error', 'Result status should be error');
  t.truthy(result.error, 'Result should have an error');
  t.is(
    result.error.message,
    'Stub processor error',
    'Error message should match'
  );
});
