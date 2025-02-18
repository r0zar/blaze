import { describe, it, expect } from 'vitest';
import { validateTransferOperation, buildBatchTransferTxOptions } from '../src/subnet-transactions';
import { buildSingleTransferTxOptions } from '../src/subnet-transactions';
import { PostConditionMode } from '@stacks/transactions';
import type { Transfer } from '../src/subnet';

describe('Subnet Transaction Utilities', () => {
    const validTransfer: Transfer = {
        signer: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
        to: 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G',
        amount: 100,
        nonce: 1234567890,
        signature: '0x1234567890abcdef'
    };

    describe('validateTransferOperation', () => {
        it('should validate a correct transfer operation', () => {
            expect(() => validateTransferOperation(validTransfer)).not.toThrow();
        });

        it('should throw error for missing to address', () => {
            const transfer = { ...validTransfer, to: '' };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: missing required fields');
        });

        it('should throw error for missing signer', () => {
            const transfer = { ...validTransfer, signer: '' };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: missing required fields');
        });

        it('should throw error for missing signature', () => {
            const transfer = { ...validTransfer, signature: '' };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: missing required fields');
        });

        it('should throw error for zero amount', () => {
            const transfer = { ...validTransfer, amount: 0 };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: amount must be positive');
        });

        it('should throw error for negative amount', () => {
            const transfer = { ...validTransfer, amount: -1 };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: amount must be positive');
        });

        it('should throw error for zero nonce', () => {
            const transfer = { ...validTransfer, nonce: 0 };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: nonce must be positive');
        });

        it('should throw error for negative nonce', () => {
            const transfer = { ...validTransfer, nonce: -1 };
            expect(() => validateTransferOperation(transfer)).toThrow('Invalid transfer operation: nonce must be positive');
        });
    });

    describe('buildBatchTransferTxOptions', () => {
        const validContract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
        const validPrivateKey = process.env.PRIVATE_KEY!;

        it('should build valid transaction options', () => {
            const result = buildBatchTransferTxOptions({
                contract: validContract,
                operations: [validTransfer],
                privateKey: validPrivateKey
            });

            expect(result).toEqual({
                contractAddress: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
                contractName: 'blaze-welsh-v0',
                functionName: 'batch-transfer',
                functionArgs: expect.any(Array),
                senderKey: validPrivateKey,
                network: expect.any(Object),
                fee: 1800
            });
        });

        it('should throw error for empty operations array', () => {
            expect(() => buildBatchTransferTxOptions({
                contract: validContract,
                operations: [],
                privateKey: validPrivateKey
            })).toThrow('Invalid parameters for building batch transfer transaction');
        });

        it('should throw error for invalid contract format', () => {
            expect(() => buildBatchTransferTxOptions({
                contract: 'invalid-contract',
                operations: [validTransfer],
                privateKey: validPrivateKey
            })).toThrow('Invalid contract format');
        });

        it('should throw error for missing private key', () => {
            expect(() => buildBatchTransferTxOptions({
                contract: validContract,
                operations: [validTransfer],
                privateKey: ''
            })).toThrow('Invalid parameters for building batch transfer transaction');
        });

        it('should validate all operations in the batch', () => {
            const invalidTransfer = { ...validTransfer, amount: 0 };
            expect(() => buildBatchTransferTxOptions({
                contract: validContract,
                operations: [validTransfer, invalidTransfer],
                privateKey: validPrivateKey
            })).toThrow('Invalid transfer operation: amount must be positive');
        });
    });

    describe('buildSingleTransferTxOptions', () => {
        const validContract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
        const validPrivateKey = process.env.PRIVATE_KEY!;

        it('should build valid single transfer transaction options', () => {
            const result = buildSingleTransferTxOptions({
                contract: validContract,
                operation: validTransfer,
                privateKey: validPrivateKey
            });

            expect(result).toEqual({
                contractAddress: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
                contractName: 'blaze-welsh-v0',
                functionName: 'transfer',
                functionArgs: expect.any(Array),
                senderKey: validPrivateKey,
                network: expect.any(Object),
                fee: 1800
            });

            // Verify function arguments are in the correct order as per the contract
            const functionArgs = result.functionArgs;
            expect(functionArgs).toHaveLength(5);
            expect(functionArgs[0]).toBeDefined(); // signature buffer
            expect(functionArgs[1]).toBeDefined(); // signer principal
            expect(functionArgs[2]).toBeDefined(); // to principal
            expect(functionArgs[3]).toBeDefined(); // amount uint
            expect(functionArgs[4]).toBeDefined(); // nonce uint
        });

        it('should throw error for invalid contract format', () => {
            expect(() => buildSingleTransferTxOptions({
                contract: 'invalid-contract',
                operation: validTransfer,
                privateKey: validPrivateKey
            })).toThrow('Invalid contract format');
        });

        it('should throw error for missing private key', () => {
            expect(() => buildSingleTransferTxOptions({
                contract: validContract,
                operation: validTransfer,
                privateKey: ''
            })).toThrow('Invalid parameters for building transfer transaction');
        });

        it('should validate the transfer operation', () => {
            const invalidTransfer = { ...validTransfer, amount: 0 };
            expect(() => buildSingleTransferTxOptions({
                contract: validContract,
                operation: invalidTransfer,
                privateKey: validPrivateKey
            })).toThrow('Invalid transfer operation: amount must be positive');
        });
    });
}); 