import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  CreateMessageRequest,
  CreateMessageResultSchema,
  ListToolsRequestSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  Dexterity,
  type SDKConfig,
  type Token,
  type Vault,
  type ExecuteOptions
} from "dexterity-sdk";
import * as dotenv from "dotenv";


// Define ToolInput type directly based on the expected structure
type ToolInput = {
  type: "object";
  properties?: Record<string, any>;
};

/* Helper types for Stacks addresses */
// Define a custom Zod type for Stacks contract identifiers
const ContractIdSchema = z.string().describe("Must be a valid Stacks contract identifier in the format e.g. 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.CONTRACT-NAME' or '.stx' for native STX");

// Clean Dexterity schema for resetting state
const CleanDexteritySchema = z.object({
  reinitialize: z.boolean().optional().default(false).describe("Whether to reinitialize the SDK after cleaning. If true, will restart the SDK with the current configuration.")
});

/* Input schemas for Dexterity SDK operations */

// 1. Get Token Information
const GetTokenInfoSchema = z.object({
  contractId: ContractIdSchema.describe("Contract identifier of the token (e.g., 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token' or '.stx' for native STX). Must be a valid Stacks contract ID.")
});

// 2. Get Swap Quote
const GetSwapQuoteSchema = z.object({
  tokenInContract: ContractIdSchema.describe("Contract identifier of the token to swap from. Must be a valid Stacks contract ID."),
  tokenOutContract: ContractIdSchema.describe("Contract identifier of the token to swap to. Must be a valid Stacks contract ID."),
  amount: z.number().positive().describe("Amount to swap in smallest units (considering token decimals). Must be a positive number.")
});

// 3. Get Single Vault
const GetVaultSchema = z.object({
  vaultId: ContractIdSchema.describe("Contract identifier of the vault/pool. Must be a valid Stacks contract ID referencing a liquidity pool.")
});

// 4. Get Vaults for Token
const GetVaultsForTokenSchema = z.object({
  tokenId: ContractIdSchema.describe("Contract identifier of the token to find vaults for. Must be a valid Stacks contract ID for a token.")
});

// 5. Discover Vaults
const DiscoverVaultsSchema = z.object({
  blacklist: z.array(ContractIdSchema).optional().describe("Array of contract IDs to exclude from discovery. Can be used to filter out known problematic pools if they fail to load."),
  serialize: z.boolean().optional().default(false).describe("Whether to return serialized LP token representations instead of full vault objects. Set to true for more lightweight results."),
  load: z.boolean().optional().default(true).describe("Whether to load discovered vaults into the router. Set to false for read-only operation to avoid side effects."),
  reserves: z.boolean().optional().default(true).describe("Whether to fetch reserve information for the vaults. Setting to false can speed up discovery if reserves aren't needed.")
});

// 6. Configure Dexterity
const ConfigureDexteritySchema = z.object({
  network: z.enum(["mainnet", "testnet"]).optional().describe("Network to connect to: 'mainnet' for production use, 'testnet' for testing."),
  mode: z.enum(["server"]).optional().describe("Mode of operation: 'client' for browser applications, 'server' for node.js server environments"),
  maxHops: z.number().min(2).max(7).optional().describe("Maximum number of hops for routing. Higher values allow more complex routes but increase computation time."),
  defaultSlippage: z.number().min(0).max(100).optional().describe("Default slippage tolerance as a percentage (e.g., 0.5 for 0.5%). Used when calculating minimum received amount."),
  apiKey: z.string().optional().describe("Hiro API key for authentication. Required for higher rate limits in production environments."),
  apiKeys: z.array(z.string()).optional().describe("Hiro API keys list for authentication. Required for higher rate limits in production environments."),
});

// 7. Get SDK Configuration
const GetConfigSchema = z.object({});

// 8. Execute Swap Schema (new)
const ExecuteSwapSchema = z.object({
  tokenInContract: ContractIdSchema.describe("Contract identifier of the token to swap from. Must be a valid Stacks contract ID."),
  tokenOutContract: ContractIdSchema.describe("Contract identifier of the token to swap to. Must be a valid Stacks contract ID."),
  amount: z.number().positive().describe("Amount to swap in smallest units (considering token decimals). Must be a positive number."),
  options: z.object({
    fee: z.number().optional().describe("Optional fee in microSTX to include with the transaction. If not provided, the default fee will be used."),
    slippage: z.number().optional().describe("Custom slippage tolerance as a percentage (e.g., 0.5 for 0.5%). Overrides the default slippage."),
    sponsored: z.boolean().optional().describe("Whether the transaction should be sponsored (fee paid by another account)."),
    wait: z.boolean().optional().describe("Whether to wait for transaction confirmation.")
  }).optional().describe("Optional parameters for the swap execution")
});

// Add schema for locating .env file
const LocateEnvSchema = z.object({
  searchPaths: z.array(z.string()).optional().describe("Optional array of paths to search for .env file. If not provided, will search in default locations.")
});

// Tool names enum
enum DexterityToolName {
  GET_TOKEN_INFO = "getTokenInfo",
  GET_SWAP_QUOTE = "getSwapQuote",
  GET_VAULT = "getVault",
  GET_ALL_VAULTS = "getAllVaults",
  GET_VAULTS_FOR_TOKEN = "getVaultsForToken",
  GET_ALL_TOKENS = "getAllTokens",
  DISCOVER_VAULTS = "discoverVaults",
  CONFIGURE_DEXTERITY = "configureDexterity",
  GET_CONFIG = "getConfig",
  CLEAN_DEXTERITY = "cleanDexterity",
  EXECUTE_SWAP = "executeSwap",
  LOCATE_ENV = "locateEnv",  // Add new tool name
}

// Tool definitions based on the schemas
const dexterityTools: Tool[] = [
  {
    name: DexterityToolName.GET_TOKEN_INFO,
    description: "Get detailed information about a Stacks token by its contract ID. Returns token name, symbol, decimals, and metadata if available. Works with fungible tokens on the Stacks blockchain, including the native STX token (use '.stx' as contractId).",
    inputSchema: zodToJsonSchema(GetTokenInfoSchema) as ToolInput,
  },
  {
    name: DexterityToolName.GET_SWAP_QUOTE,
    description: "Get a quote for swapping between two tokens on the Stacks blockchain. Finds the optimal route through available liquidity pools, accounting for prices and fees. Returns expected output amount, price impact, and route information. Does not execute the actual swap. Can use the same token for both tokenInContract and tokenOutContract for arbitrage opportunities.",
    inputSchema: zodToJsonSchema(GetSwapQuoteSchema) as ToolInput,
  },
  {
    name: DexterityToolName.GET_VAULT,
    description: "Get detailed information about a specific liquidity pool (vault) on the Stacks blockchain. Returns token pair, reserves, fees, and other pool-specific data. Use this to analyze specific pools before interacting with them.",
    inputSchema: zodToJsonSchema(GetVaultSchema) as ToolInput,
  },
  {
    name: DexterityToolName.GET_ALL_VAULTS,
    description: "Get a list of all currently loaded liquidity pools/vaults in the Dexterity router. Returns information about all available pools that can be used for swapping tokens. Use this to get an overview of available liquidity in the ecosystem.",
    inputSchema: zodToJsonSchema(z.object({})) as ToolInput,
  },
  {
    name: DexterityToolName.GET_VAULTS_FOR_TOKEN,
    description: "Get all liquidity pools/vaults that contain a specific token. Useful for finding trading pairs for a particular token or analyzing liquidity distribution across different pairs containing the token.",
    inputSchema: zodToJsonSchema(GetVaultsForTokenSchema) as ToolInput,
  },
  {
    name: DexterityToolName.GET_ALL_TOKENS,
    description: "Get a list of all tokens available for trading across all pools known to the Dexterity router. Returns token contract IDs, symbols, names, and decimals. Use this to explore the token ecosystem on Stacks.",
    inputSchema: zodToJsonSchema(z.object({})) as ToolInput,
  },
  {
    name: DexterityToolName.DISCOVER_VAULTS,
    description: "Discover liquidity pools (vaults) on the Stacks blockchain by searching for contracts implementing the pool trait. This tool actively scans the blockchain for new pools and can optionally add them to the router. Use for discovering new trading opportunities.",
    inputSchema: zodToJsonSchema(DiscoverVaultsSchema) as ToolInput,
  },
  {
    name: DexterityToolName.CONFIGURE_DEXTERITY,
    description: "Configure the Dexterity SDK settings, including network (mainnet/testnet), operation mode, routing parameters, and API credentials. Changes apply immediately to all subsequent operations.",
    inputSchema: zodToJsonSchema(ConfigureDexteritySchema) as ToolInput,
  },
  {
    name: DexterityToolName.GET_CONFIG,
    description: "Get the current Dexterity SDK configuration, showing network, mode, and other settings. Use this to verify the current state of the SDK before performing operations.",
    inputSchema: zodToJsonSchema(GetConfigSchema) as ToolInput,
  },
  {
    name: DexterityToolName.CLEAN_DEXTERITY,
    description: "Clean up Dexterity SDK resources and optionally reinitialize the SDK. This helps manage memory usage and reset the SDK state. Use when changing networks or when encountering unexpected behavior.",
    inputSchema: zodToJsonSchema(CleanDexteritySchema) as ToolInput,
  },
  {
    name: DexterityToolName.EXECUTE_SWAP,
    description: "Execute a token swap transaction on the Stacks blockchain. This will create and broadcast a transaction to exchange tokens based on the best available route. Requires the SDK to be in server mode with valid credentials. The transaction will be signed using the configured private key or seed phrase. You can use the same token for both tokenInContract and tokenOutContract for arbitrage opportunities.",
    inputSchema: zodToJsonSchema(ExecuteSwapSchema) as ToolInput,
  },
  {
    name: DexterityToolName.LOCATE_ENV,
    description: "Locate and read the .env file containing Dexterity configuration. If not found, ask the user to provide the path to the .env filepath.",
    inputSchema: zodToJsonSchema(LocateEnvSchema) as ToolInput,
  },
];

// Function to locate .env file
const findEnvFile = async (searchPaths?: string[]) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Default search paths
    const defaultPaths = [
      '.env',
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), 'servers', 'src', 'dexterity', '.env'),
      path.join(process.cwd(), '..', 'servers', 'src', 'dexterity', '.env')
    ];

    // Combine default paths with any provided paths
    const paths = [...defaultPaths, ...(searchPaths || [])];

    // Search for .env file
    for (const searchPath of paths) {
      try {
        const stats = await fs.stat(searchPath);
        if (stats.isFile()) {
          dotenv.config({ path: searchPath });
          return { found: true, path: searchPath };
        }
      } catch (err) {
        // Ignore errors for files that don't exist
        continue;
      }
    }

    return { found: false, searchedPaths: paths };
  } catch (error) {
    console.error('Error finding .env file:', error);
    return { found: false, error };
  }
};

// Function to initialize Dexterity with configuration
const initializeDexterity = async (config?: Partial<SDKConfig>) => {
  try {
    // First, try to find the .env file
    await findEnvFile();

    // Merge environment variables with provided config
    const envSDKConfig: Partial<SDKConfig> = {
      network: process.env.NETWORK as "mainnet" | "testnet" || "mainnet",
      mode: "server",
      maxHops: process.env.MAX_HOPS ? parseInt(process.env.MAX_HOPS) : 3,
      defaultSlippage: process.env.DEFAULT_SLIPPAGE ? parseFloat(process.env.DEFAULT_SLIPPAGE) : 0.5,
      apiKey: process.env.HIRO_API_KEY,
      apiKeys: process.env.HIRO_API_KEYS?.split(','),
    };

    // Combine env config with provided config (provided config takes precedence)
    const finalConfig = { ...envSDKConfig, ...config };

    // Make sure we have a valid configuration
    await Dexterity.configure(finalConfig);
    await Dexterity.discover({
      load: true,
      serialize: false,
      reserves: true,
    });
    return true;
  } catch (error) {
    console.error('Error initializing Dexterity:', error);
    return false;
  }
};

// Function to clean up Dexterity resources
const cleanDexterity = async () => {
  try {
    // The Dexterity SDK doesn't have explicit cleanup methods
    // We'll simply log that cleanup was requested and return success
    // In a real implementation, you would add actual cleanup code here
    // based on the SDK's capabilities

    // For future implementation:
    // 1. Disconnect any WebSockets or network connections
    // 2. Clear internal caches
    // 3. Release any resources being held

    return true;
  } catch (error) {
    return false;
  }
};

export const createServer = () => {
  const server = new Server(
    {
      name: "dexterity",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    },
  );

  let subscriptions: Set<string> = new Set();
  let updateInterval: NodeJS.Timeout | undefined;

  // Set up update interval for subscribed resources
  updateInterval = setInterval(() => {
    for (const uri of subscriptions) {
      server.notification({
        method: "notifications/resources/updated",
        params: { uri },
      });
    }
  }, 5000);

  // Helper method to request sampling from client
  const requestSampling = async (
    context: string,
    uri: string,
    maxTokens: number = 100,
  ) => {
    const request: CreateMessageRequest = {
      method: "sampling/createMessage",
      params: {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Resource ${uri} context: ${context}`,
            },
          },
        ],
        systemPrompt: "You are a helpful test server.",
        maxTokens,
        temperature: 0.7,
        includeContext: "thisServer",
      },
    };

    return await server.request(request, CreateMessageResultSchema);
  };


  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const { uri } = request.params;
    subscriptions.add(uri);

    // Request sampling from client when someone subscribes
    await requestSampling("A new subscription was started", uri);
    return {};
  });

  // Initialize Dexterity with default configuration
  (async () => {
    await initializeDexterity();
  })();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: dexterityTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Handle CONFIGURE_DEXTERITY
    if (name === DexterityToolName.CONFIGURE_DEXTERITY) {
      const validatedArgs = ConfigureDexteritySchema.parse(args);
      try {
        await Dexterity.configure(validatedArgs);
        return {
          content: [
            {
              type: "text",
              text: `Dexterity SDK configured successfully with: ${JSON.stringify(validatedArgs, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error configuring Dexterity SDK: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_TOKEN_INFO
    if (name === DexterityToolName.GET_TOKEN_INFO) {
      const validatedArgs = GetTokenInfoSchema.parse(args);
      try {
        const contractId = validatedArgs.contractId as string;
        const tokenInfo = await Dexterity.getTokenInfo(contractId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tokenInfo, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching token info: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_SWAP_QUOTE
    if (name === DexterityToolName.GET_SWAP_QUOTE) {
      const validatedArgs = GetSwapQuoteSchema.parse(args);
      try {
        const tokenInContract = validatedArgs.tokenInContract as string;
        const tokenOutContract = validatedArgs.tokenOutContract as string;
        const amount = validatedArgs.amount as number;

        const quote = await Dexterity.getQuote(
          tokenInContract as `${string}.${string}`,
          tokenOutContract as `${string}.${string}`,
          amount
        );

        // Format route information for better readability
        const routeDescription = quote.route.path.map((p: Token) => p.symbol || p.contractId).join(" → ");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                amountIn: quote.amountIn,
                amountOut: quote.amountOut,
                expectedPrice: quote.expectedPrice,
                minimumReceived: quote.minimumReceived,
                route: {
                  description: routeDescription,
                  hops: quote.route.hops,
                  path: quote.route.path.map((token: Token) => ({
                    contractId: token.contractId,
                    symbol: token.symbol
                  }))
                }
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting swap quote: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle EXECUTE_SWAP (new)
    if (name === DexterityToolName.EXECUTE_SWAP) {
      const validatedArgs = ExecuteSwapSchema.parse(args);
      try {
        // Check if we're in server mode - only server mode can execute transactions
        if (Dexterity.config.mode !== "server") {
          return {
            content: [
              {
                type: "text",
                text: "Error: Swap execution requires server mode. Current mode is 'client'. Use configureDexterity to set mode to 'server' first."
              }
            ]
          };
        }

        const tokenInContract = validatedArgs.tokenInContract as `${string}.${string}`;
        const tokenOutContract = validatedArgs.tokenOutContract as `${string}.${string}`;
        const amount = validatedArgs.amount as number;
        const options: ExecuteOptions = validatedArgs.options || {};

        // Execute the swap
        const txResult = await Dexterity.executeSwap(
          tokenInContract,
          tokenOutContract,
          amount,
          options
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(txResult, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing swap: ${error instanceof Error ? error.stack : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_VAULT
    if (name === DexterityToolName.GET_VAULT) {
      const validatedArgs = GetVaultSchema.parse(args);
      try {
        const vaultId = validatedArgs.vaultId as string;
        const vault = Dexterity.getVault(vaultId as `${string}.${string}`);

        if (!vault) {
          return {
            content: [
              {
                type: "text",
                text: `Vault not found: ${vaultId}`
              }
            ]
          };
        }

        const tokens = vault.getTokens();
        const reserves = vault.getReserves();

        // Get properties safely
        const vaultInfo: any = {
          contractId: vault.contractId,
          tokens: tokens.map((token: Token) => ({
            contractId: token.contractId,
            symbol: token.symbol,
            name: token.name
          })),
          reserves: reserves
        };

        // Add additional properties if they exist
        if ('lpToken' in vault) {
          vaultInfo['lpToken'] = vault['lpToken'];
        }
        if ('fee' in vault) {
          vaultInfo['fee'] = vault['fee'];
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(vaultInfo, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting vault: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_ALL_VAULTS
    if (name === DexterityToolName.GET_ALL_VAULTS) {
      try {
        const sdkVaults = Dexterity.getVaults();

        const simplifiedVaults = sdkVaults.map(vault => {
          const tokens = vault.getTokens();
          const reserves = vault.getReserves();

          return {
            contractId: vault.contractId,
            tokens: tokens.map(token => ({
              contractId: token.contractId,
              symbol: token.symbol
            })),
            reserves: reserves
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: sdkVaults.length,
                vaults: simplifiedVaults
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting all vaults: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_VAULTS_FOR_TOKEN
    if (name === DexterityToolName.GET_VAULTS_FOR_TOKEN) {
      const validatedArgs = GetVaultsForTokenSchema.parse(args);
      try {
        const tokenId = validatedArgs.tokenId as string;
        const vaultsMap = Dexterity.getVaultsForToken(tokenId as `${string}.${string}`);
        const sdkVaults = Array.from(vaultsMap.values());

        const simplifiedVaults = sdkVaults.map(vault => {
          const tokens = vault.getTokens();
          const reserves = vault.getReserves();

          return {
            contractId: vault.contractId,
            tokens: tokens.map(token => ({
              contractId: token.contractId,
              symbol: token.symbol
            })),
            reserves: reserves
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tokenId: tokenId,
                count: sdkVaults.length,
                vaults: simplifiedVaults
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting vaults for token: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_ALL_TOKENS
    if (name === DexterityToolName.GET_ALL_TOKENS) {
      try {
        const tokens = Dexterity.getTokens();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: tokens.length,
                tokens: tokens.map((token: Token) => ({
                  contractId: token.contractId,
                  symbol: token.symbol,
                  name: token.name,
                  decimals: token.decimals
                }))
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting all tokens: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle DISCOVER_VAULTS
    if (name === DexterityToolName.DISCOVER_VAULTS) {
      const validatedArgs = DiscoverVaultsSchema.parse(args);
      try {
        const blacklist = validatedArgs.blacklist as string[] || [];

        const vaults = await Dexterity.discover({
          blacklist: blacklist.map(id => id as `${string}.${string}`),
          serialize: validatedArgs.serialize || false,
          load: validatedArgs.load || true,
          reserves: validatedArgs.reserves !== undefined ? validatedArgs.reserves : true
        });

        // Safely extract vault data without assuming specific properties
        const simplifiedVaults = (vaults as Vault[]).map((vault) => {
          const vaultInfo = {
            contractId: vault.contractId,
            tokens: vault.getTokens()!.map((token: Token) => ({
              contractId: token.contractId,
              symbol: token.symbol
            })),
            reserves: vault.getReserves()!
          }

          return vaultInfo;
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: vaults.length,
                vaults: simplifiedVaults
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error discovering vaults: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle GET_CONFIG
    if (name === DexterityToolName.GET_CONFIG) {
      try {
        const config = Dexterity.config;

        // Filter out any sensitive information
        const safeConfig = {
          ...config,
          // Omit API keys and private keys
          apiKey: config.apiKey ? "[REDACTED]" : undefined,
          apiKeys: config.apiKeys ? "[REDACTED]" : undefined,
          privateKey: config.privateKey ? "[REDACTED]" : undefined,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(safeConfig, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting configuration: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Handle CLEAN_DEXTERITY
    if (name === DexterityToolName.CLEAN_DEXTERITY) {
      const validatedArgs = CleanDexteritySchema.parse(args);
      try {
        const cleaned = await cleanDexterity();

        // Reinitialize if requested
        let reinitialized = false;
        if (validatedArgs.reinitialize && cleaned) {
          // Just pass the current config directly - let TypeScript handle the validation internally
          reinitialized = await initializeDexterity();
        }

        return {
          content: [
            {
              type: "text",
              text: `Dexterity SDK resources cleaned. ${validatedArgs.reinitialize
                ? `Reinitialization ${reinitialized ? 'successful' : 'failed'}.`
                : 'SDK was not reinitialized.'
                }`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error cleaning Dexterity SDK: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    // Add handler for LOCATE_ENV
    if (name === DexterityToolName.LOCATE_ENV) {
      const validatedArgs = LocateEnvSchema.parse(args);
      try {
        const result = await findEnvFile(validatedArgs.searchPaths);

        if (result.found && result.path) {
          const fs = await import('fs/promises');
          const contents = await fs.readFile(result.path, 'utf-8');

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  found: true,
                  path: result.path,
                  contents: contents.split('\n').map(line => {
                    // Redact sensitive values but show variable names
                    if (line.trim() && !line.startsWith('#')) {
                      const [key] = line.split('=');
                      return `${key}=[REDACTED]`;
                    }
                    return line;
                  }).join('\n')
                }, null, 2)
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                found: false,
                searchedPaths: result.searchedPaths,
                message: "No .env file found in any of the searched locations."
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error locating .env file: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  server.setRequestHandler(CompleteRequestSchema, async (request) => {
    // We don't have any completion providers for now
    return { completion: { values: [], hasMore: false, total: 0 } };
  });

  server.setRequestHandler(SetLevelRequestSchema, async (request) => {
    const { level } = request.params;

    await server.notification({
      method: "notifications/message",
      params: {
        level: "debug",
        logger: "dexterity-server",
        data: `Logging level set to: ${level}`,
      },
    });

    return {};
  });

  // Return server and utility functions
  return {
    server,
    cleanup: cleanDexterity,  // Expose the clean function for external use
    initialize: initializeDexterity  // Expose the initialization function
  };
};