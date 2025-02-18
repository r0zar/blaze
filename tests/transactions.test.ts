import { describe, it, expect } from 'vitest';
import { buildDepositTxOptions, buildWithdrawTxOptions } from '../src/transactions';
import { PostConditionMode } from '@stacks/transactions';

describe('Transaction Utilities', () => {
    const validSubnet = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
    const validToken = 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token::welshcorgicoin';
    const validSigner = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS';
    const validAmount = 100;

    describe('buildDepositTxOptions', () => {
        it('should build valid deposit transaction options', () => {
            const result = buildDepositTxOptions({
                subnet: validSubnet,
                tokenIdentifier: validToken,
                signer: validSigner,
                amount: validAmount
            });

            expect(result).toEqual({
                contractAddress: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
                contractName: 'blaze-welsh-v0',
                functionName: 'deposit',
                functionArgs: expect.any(Array),
                postConditions: expect.any(Array),
                postConditionMode: PostConditionMode.Deny
            });
        });

        it('should throw error for invalid subnet format', () => {
            expect(() => buildDepositTxOptions({
                subnet: 'invalid-subnet',
                tokenIdentifier: validToken,
                signer: validSigner,
                amount: validAmount
            })).toThrow('Invalid subnet or token identifier format');
        });

        it('should throw error for invalid token format', () => {
            expect(() => buildDepositTxOptions({
                subnet: validSubnet,
                tokenIdentifier: 'invalid-token',
                signer: validSigner,
                amount: validAmount
            })).toThrow('Invalid subnet or token identifier format');
        });

        it('should throw error for zero amount', () => {
            expect(() => buildDepositTxOptions({
                subnet: validSubnet,
                tokenIdentifier: validToken,
                signer: validSigner,
                amount: 0
            })).toThrow('Invalid parameters for building deposit transaction options');
        });

        it('should throw error for negative amount', () => {
            expect(() => buildDepositTxOptions({
                subnet: validSubnet,
                tokenIdentifier: validToken,
                signer: validSigner,
                amount: -1
            })).toThrow('Invalid parameters for building deposit transaction options');
        });
    });

    describe('buildWithdrawTxOptions', () => {
        it('should build valid withdraw transaction options', () => {
            const result = buildWithdrawTxOptions({
                subnet: validSubnet,
                tokenIdentifier: validToken,
                amount: validAmount
            });

            expect(result).toEqual({
                contractAddress: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
                contractName: 'blaze-welsh-v0',
                functionName: 'withdraw',
                functionArgs: expect.any(Array),
                postConditions: expect.any(Array),
                postConditionMode: PostConditionMode.Deny
            });
        });

        it('should throw error for invalid subnet format', () => {
            expect(() => buildWithdrawTxOptions({
                subnet: 'invalid-subnet',
                tokenIdentifier: validToken,
                amount: validAmount
            })).toThrow('Invalid subnet or token identifier format');
        });

        it('should throw error for invalid token format', () => {
            expect(() => buildWithdrawTxOptions({
                subnet: validSubnet,
                tokenIdentifier: 'invalid-token',
                amount: validAmount
            })).toThrow('Invalid subnet or token identifier format');
        });

        it('should throw error for zero amount', () => {
            expect(() => buildWithdrawTxOptions({
                subnet: validSubnet,
                tokenIdentifier: validToken,
                amount: 0
            })).toThrow('Invalid parameters for building withdraw transaction options');
        });

        it('should throw error for negative amount', () => {
            expect(() => buildWithdrawTxOptions({
                subnet: validSubnet,
                tokenIdentifier: validToken,
                amount: -1
            })).toThrow('Invalid parameters for building withdraw transaction options');
        });
    });
}); 