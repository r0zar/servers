# Dexterity MCP Server

A specialized Model Context Protocol (MCP) server for interacting with the Dexterity AMM protocol on Stacks, designed to be used with AI assistants for automated trading and arbitrage detection.

## Setup Instructions

### 1. Install the MCP Server
1. Fork the repository from [github.com/r0zar/servers](https://github.com/r0zar/servers)
2. Clone your forked repository
3. Navigate to the dexterity server directory:
   ```bash
   cd servers/src/dexterity
   ```
4. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

### 2. Configure Cursor
1. Open Cursor settings
2. Navigate to the MCP section
3. Add a new MCP server with:
   - Name: `Dexterity`
   - Command: `node <absolute-path-to-servers/src/dexterity/dist/index.js>`
   
   Example:
   ```
   node /home/user/servers/src/dexterity/dist/index.js
   ```

### 3. Environment Configuration
Create a `.env` file with the following required variables:
```bash
SEED_PHRASE="your seed phrase"
HIRO_API_KEY="your-api-key"
# Or multiple API keys
HIRO_API_KEYS=["key1", "key2", "key3"]
```

To specify the location of your `.env` file to the AI, simply paste the absolute path:
```
> set up dexterity with my .env at /path/to/your/.env
```

## Using with AI

The AI assistant can perform various operations through the MCP server. Here are some key capabilities:

### 1. Token Swaps
- Swap from any token to any other token.
- Ask the AI to find arbitrage opportunities by swapping from a token back to itself
- Example prompt: "Find arbitrage opportunities for sBTC"
- The AI will analyze routes through multiple pools to find profitable paths

### 2. Token Inspection
- Query token information
- List available tokens
- Check token prices and liquidity

### 3. Vault Analysis
- Analyze liquidity pools
- Monitor reserve levels
- Discover new vaults

## Example Interactions

Ask the AI to:
- "Find arbitrage opportunities for sBTC"
- "Check the reserves in the STX-WELSH pool"
- "Execute a profitable arbitrage trade"
- "Monitor pool imbalances"

The AI will handle all the technical details and execute the appropriate commands through the MCP server.

## Important Notes

1. Always ensure your `.env` file is properly configured before starting
2. The AI needs the absolute path to your `.env` file to function properly
3. Keep your seed phrase and API keys secure
4. None of your personal information leaves your machine.
4. The AI is pretty good about converting decimals, but always check first.


### GLHF

Have fun AI trading on bitcoin!