import { vi } from 'vitest'
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

// Ensure required environment variables are set
if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable must be set for tests');
}

// Mock @stacks/connect
vi.mock('@stacks/connect', () => ({
  openContractCall: vi.fn(),
  openContractDeploy: vi.fn(),
  signMessage: vi.fn(),
  showSignMessage: vi.fn(),
})); 
