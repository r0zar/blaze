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
            `[${options.name.toUpperCase()} QUERY] ${intent.contract}.${intent.function
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
            `[${options.name.toUpperCase()} ERROR] ${intent.contract}.${intent.function
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
              `[${options.name.toUpperCase()} MUTATE] ${intent.contract}.${intent.function
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
              `[${options.name.toUpperCase()} ERROR] ${intent.contract}.${intent.function
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


/**
 * Create an L2 service from a URL endpoint
 */
export function createL2ServiceFromUrl(
  url: string,
  options: {
    debug?: boolean;
    logger?: any;
    headers?: Record<string, string>;
  }
): Service {
  const logger = options.logger || console;
  const debug = options.debug || false;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return {
    name: 'l2',

    async query(intent: QueryIntent): Promise<QueryResult> {
      try {
        if (debug) {
          logger.debug(`[L2 QUERY] ${intent.contract}.${intent.function}`);
        }

        const response = await fetch(`${url}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contract: intent.contract,
            function: intent.function,
            args: intent.args,
          }),
        });

        if (!response.ok) {
          throw new Error(`L2 service error: ${response.status}`);
        }

        const result = await response.json();

        return {
          status: 'success',
          data: result,
        };
      } catch (error) {
        if (debug) {
          logger.warn(
            `[L2 ERROR] ${intent.contract}.${intent.function}: ${error.message}`
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

    async mutate(intent: MutateIntent): Promise<MutateResult> {
      try {
        if (debug) {
          logger.debug(`[L2 MUTATE] ${intent.contract}.${intent.function}`);
        }

        const response = await fetch(`${url}/mutate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(intent),
        });

        if (!response.ok) {
          throw new Error(`L2 submission error: ${response.status}`);
        }

        const result = await response.json();

        if (result && result.txId) {
          return {
            status: 'pending',
            txId: result.txId,
          };
        }

        return {
          status: 'error',
          error: {
            message: 'L2 service did not return a transaction ID',
          },
        };
      } catch (error) {
        if (debug) {
          logger.warn(
            `[L2 ERROR] ${intent.contract}.${intent.function}: ${error.message}`
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
  };
}
