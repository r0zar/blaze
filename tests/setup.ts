import { vi } from 'vitest'

// Mock @stacks/connect
vi.mock('@stacks/connect', () => ({
  openContractCall: vi.fn(),
  openContractDeploy: vi.fn(),
  signMessage: vi.fn(),
  showSignMessage: vi.fn(),
})); 
