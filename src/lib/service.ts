/**
 * Unified service interface for all data providers
 */

import { MutateIntent, MutateResult, QueryIntent, QueryResult } from './intent';

/**
 * Common interface for all services that can process state operations
 * This includes blockchain, L2, or any custom data sources
 */
export interface Service {
  /**
   * Service name for identification and logging
   */
  readonly name: string;

  /**
   * Query state (read-only operation)
   * @param intent - Query intent
   * @returns Promise resolving to the query result
   */
  query(intent: QueryIntent): Promise<QueryResult>;

  /**
   * Mutate state (state-changing operation)
   * Optional - some services may be read-only
   * @param intent - Mutation intent with signature
   * @returns Promise resolving to the mutation result
   */
  mutate?(intent: MutateIntent): Promise<MutateResult>;
}

/**
 * Base options for state services
 */
export interface ServiceOptions {
  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom logger implementation (defaults to console)
   */
  logger?: any;

  /**
   * Service-specific options
   */
  [key: string]: any;
}

/**
 * Factory function to create a generic service adapter
 * Useful for creating a service from simple functions
 */
export function createService(options: {
  name: string;
  queryFn: (intent: QueryIntent) => Promise<any>;
  mutateFn?: (intent: MutateIntent) => Promise<{ txId: string } | undefined>;
  debug?: boolean;
  logger?: any;
}): Service {
  const logger = options.logger || console;

  return {
    name: options.name,

    async query(intent: QueryIntent): Promise<QueryResult> {
      try {
        if (options.debug) {
          logger.debug(
            `[${options.name.toUpperCase()} QUERY] ${intent.contract}.${
              intent.function
            }`
          );
        }

        const result = await options.queryFn(intent);

        if (result !== undefined) {
          return {
            status: 'success',
            data: result,
          };
        }

        return {
          status: 'error',
          error: {
            message: `No data found for ${intent.contract}.${intent.function}`,
          },
        };
      } catch (error) {
        if (options.debug) {
          logger.warn(
            `[${options.name.toUpperCase()} ERROR] ${intent.contract}.${
              intent.function
            }: ${error.message}`
          );
        }

        return {
          status: 'error',
          error: {
            message: error.message,
            details: error,
          },
        };
      }
    },

    ...(options.mutateFn && {
      async mutate(intent: MutateIntent): Promise<MutateResult> {
        try {
          if (options.debug) {
            logger.debug(
              `[${options.name.toUpperCase()} MUTATE] ${intent.contract}.${
                intent.function
              }`
            );
          }

          const result = await options.mutateFn(intent);

          if (result && result.txId) {
            return {
              status: 'pending',
              txId: result.txId,
            };
          }

          return {
            status: 'error',
            error: {
              message: `No transaction ID returned for ${intent.contract}.${intent.function}`,
            },
          };
        } catch (error) {
          if (options.debug) {
            logger.warn(
              `[${options.name.toUpperCase()} ERROR] ${intent.contract}.${
                intent.function
              }: ${error.message}`
            );
          }

          return {
            status: 'error',
            error: {
              message: error.message,
              details: error,
            },
          };
        }
      },
    }),
  };
}
