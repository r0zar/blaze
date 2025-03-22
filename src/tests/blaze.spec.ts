import { Cl } from '@stacks/transactions';
import test from 'ava';

import { Blaze } from '../lib/blaze';

// Test constants
const TOKEN_CONTRACT =
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token';
const TEST_ADDRESS = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS';

test('Queries token balance of charisma-token', async (t) => {
  // Create Blaze client
  const blaze = new Blaze({
    network: 'mainnet',
    disableCache: true,
  });

  // Create balance query intent
  const balanceIntent = blaze.createQueryIntent(TOKEN_CONTRACT, 'get-balance', [
    Cl.address(TEST_ADDRESS),
  ]);

  // Execute the query
  const balanceResult = await blaze.query(balanceIntent);

  // Assertions
  t.is(balanceResult.status, 'success', 'Balance query should succeed');
  t.truthy(balanceResult.data, 'Should return balance data');
  t.is(
    typeof balanceResult.data,
    'string',
    'Balance should be returned as string'
  );

  // Parse the balance and verify it's a valid number
  const balance = Number(balanceResult.data);
  t.false(isNaN(balance), 'Balance should be convertible to a number');
  t.true(balance >= 0, 'Balance should be non-negative');

  console.log(`Balance of ${TEST_ADDRESS}: ${balance} charisma tokens`);
});

test('Queries total supply of charisma-token', async (t) => {
  // Create Blaze client
  const blaze = new Blaze({
    network: 'mainnet',
    disableCache: true,
  });

  // Create total supply query intent
  const supplyIntent = blaze.createQueryIntent(
    TOKEN_CONTRACT,
    'get-total-supply',
    []
  );

  // Execute the query
  const supplyResult = await blaze.query(supplyIntent);

  // Assertions
  t.is(supplyResult.status, 'success', 'Total supply query should succeed');
  t.truthy(supplyResult.data, 'Should return supply data');
  t.is(
    typeof supplyResult.data,
    'string',
    'Total supply should be returned as string'
  );

  // Parse the supply and verify it's a valid number
  const totalSupply = Number(supplyResult.data);
  t.false(isNaN(totalSupply), 'Total supply should be convertible to a number');
  t.true(totalSupply > 0, 'Total supply should be positive');

  console.log(`Total supply of charisma tokens: ${totalSupply}`);
});

// test('Can query token information using convenience method', async (t) => {
//     // Create Blaze client
//     const blaze = new Blaze({
//         network: 'mainnet',
//         disableCache: true,
//     });

//     // Use convenience method instead of creating an intent manually
//     const result = await blaze.call(
//         TOKEN_CONTRACT,
//         'get-total-supply',
//         []
//     );

//     // Assertions
//     t.is(result.status, 'success', 'Convenience method query should succeed');
//     t.truthy(result.data, 'Should return data');

//     // Parse the supply and verify it's a valid number
//     const totalSupply = Number(result.data);
//     t.false(isNaN(totalSupply), 'Total supply should be convertible to a number');

//     console.log(`Total supply (via convenience method): ${totalSupply}`);
// });
