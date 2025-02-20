// Ensure required environment variables are set
if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable must be set for tests');
}