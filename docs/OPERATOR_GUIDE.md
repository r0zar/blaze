# Blaze Subnet Operator Guide

This guide provides step-by-step instructions for setting up and operating a Blaze subnet node. Blaze subnet nodes are responsible for processing off-chain transfers and managing state synchronization with the Stacks blockchain.

## Table of Contents
- [Prerequisites](#prerequisites)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Node](#running-the-node)
- [Monitoring](#monitoring)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Prerequisites

Before setting up your Blaze subnet node, ensure you have:

1. A Stacks account with STX for transaction fees
2. Node.js v18 or later installed
3. Access to a Vercel KV store or Redis instance
4. SSL certificate for secure WebSocket connections
5. Domain name (recommended)
6. Git installed

## System Requirements

Minimum system specifications:
- 4 CPU cores
- 8GB RAM
- 50GB SSD storage
- 100Mbps internet connection

Recommended specifications:
- 8 CPU cores
- 16GB RAM
- 100GB SSD storage
- 1Gbps internet connection

## Installation

1. Clone the Blaze repository:
   ```bash
   git clone https://github.com/r0zar/blaze.git
   cd blaze
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Create environment configuration:
   ```bash
   cp .env.example .env
   ```

## Configuration

### Environment Variables

Edit your `.env` file with the following required variables:

```env
# Required
PRIVATE_KEY=your-stacks-private-key
KV_URL=your-vercel-kv-or-redis-url
KV_REST_API_URL=your-kv-rest-api-url
KV_REST_API_TOKEN=your-kv-rest-api-token
KV_REST_API_READ_ONLY_TOKEN=your-kv-read-only-token

# Optional
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
MAX_BATCH_SIZE=20
BATCH_INTERVAL=60000
```

### Key Configuration Parameters

1. **PRIVATE_KEY**: Your Stacks account private key for signing transactions
   - Must have sufficient STX for transaction fees
   - Should be a dedicated operator account

2. **KV Configuration**:
   - Set up a Vercel KV store or Redis instance
   - Configure access credentials
   - Ensure proper backup procedures

3. **Network Parameters**:
   - `MAX_BATCH_SIZE`: Maximum number of transfers per batch (default: 20)
   - `BATCH_INTERVAL`: Time between batch processing in milliseconds (default: 60000)

## Running the Node

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the node:
   ```bash
   npm run start
   ```

For production deployment:
```bash
npm run start:prod
```

### Using PM2 (recommended)

1. Install PM2:
   ```bash
   npm install -g pm2
   ```

2. Create PM2 configuration:
   ```bash
   # ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'blaze-node',
       script: 'dist/index.js',
       instances: 1,
       autorestart: true,
       watch: false,
       max_memory_restart: '1G',
       env: {
         NODE_ENV: 'production'
       }
     }]
   }
   ```

3. Start with PM2:
   ```bash
   pm2 start ecosystem.config.js
   ```

## Monitoring

### Health Checks

The node exposes several endpoints for monitoring:

1. `/health` - Basic health check
2. `/metrics` - Prometheus metrics
3. `/status` - Detailed node status

### Key Metrics to Monitor

1. **Performance Metrics**:
   - Batch processing time
   - Queue size
   - Transaction success rate
   - Response times

2. **System Metrics**:
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network bandwidth

3. **Business Metrics**:
   - Total transfers processed
   - Active users
   - Error rates
   - Balance updates

### Logging

Logs are written to:
- Console (stdout/stderr)
- `logs/blaze.log` (when file logging is enabled)

Configure log rotation to manage log files:
```bash
# Example logrotate configuration
/var/log/blaze/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 blaze blaze
}
```

## Security Considerations

1. **Private Key Management**:
   - Use environment variables for sensitive data
   - Consider using a hardware security module (HSM)
   - Regular key rotation

2. **Network Security**:
   - Enable SSL/TLS
   - Use firewalls to restrict access
   - Regular security audits
   - DDoS protection

3. **Access Control**:
   - Implement rate limiting
   - Use API keys for client authentication
   - Monitor for suspicious activity

## Troubleshooting

### Common Issues

1. **Connection Issues**:
   ```bash
   # Check KV store connection
   npm run check-kv-connection
   
   # Verify Stacks node connectivity
   npm run check-stacks-connection
   ```

2. **Transaction Failures**:
   - Check STX balance
   - Verify nonce handling
   - Review gas prices

3. **Performance Issues**:
   - Monitor system resources
   - Check batch processing logs
   - Verify KV store performance

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run start
```

## FAQ

**Q: How many transactions can a node process?**
A: A single node can process up to 200 transfers per batch, with batches processed every minute by default. This can be adjusted based on your requirements.

**Q: What happens if the node goes offline?**
A: Unprocessed transfers remain in the queue and will be processed when the node comes back online. The node implements automatic recovery procedures.

**Q: How can I backup node data?**
A: Regular backups of the KV store are essential. Implement automated backup procedures for your KV solution.

**Q: How do I upgrade the node software?**
A: Follow these steps:
1. Backup your data
2. Stop the node
3. Update the code
4. Run migrations if any
5. Restart the node

## Support

For additional support:
- GitHub Issues: [Report issues](https://github.com/r0zar/blaze/issues)