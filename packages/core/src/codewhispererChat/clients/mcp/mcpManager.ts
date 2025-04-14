/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Tool } from '@amzn/codewhisperer-streaming'
import { getLogger } from '../../../shared/logger'

const logger = getLogger()

/**
 * Configuration for an MCP client
 */
export interface MCPClientConfig {
    /** Unique identifier for this client */
    id: string
    /** Command to execute for the client */
    command: string
    /** Arguments to pass to the command */
    args: string[]
}

/**
 * Manages multiple MCP clients and aggregates their tools
 */
export class MCPManager {
    private clients: Map<string, Client> = new Map()
    private transports: Map<string, StdioClientTransport> = new Map()
    private tools: Tool[] = []
    private clientConfigs: MCPClientConfig[]
    private initialized = false

    /**
     * Creates a new MCP Manager
     * @param clientConfigs Array of MCP client configurations
     */
    constructor(clientConfigs: MCPClientConfig[]) {
        this.clientConfigs = clientConfigs
    }

    /**
     * Initializes all MCP clients and aggregates their tools
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return
        }

        try {
            // Create and connect all clients
            for (const config of this.clientConfigs) {
                await this.initializeClient(config)
            }

            this.initialized = true
            logger.info(`MCPManager initialized with ${this.clients.size} clients and ${this.tools.length} tools`)
        } catch (error) {
            logger.error(`Failed to initialize MCPManager: ${error}`)
            throw error
        }
    }

    /**
     * Initializes a single MCP client
     * @param config Client configuration
     */
    private async initializeClient(config: MCPClientConfig): Promise<void> {
        try {
            logger.debug(`Initializing MCP client: ${config.id}`)

            // Create client and transport
            const client = new Client()
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
            })

            // Connect client
            await client.connect(transport)

            // Get tools from client
            const toolsResult = await client.listTools()
            const clientTools = toolsResult.tools.map((tool) => ({
                toolSpecification: {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: { json: tool.inputSchema },
                },
            }))

            // Store client, transport, and tools
            this.clients.set(config.id, client)
            this.transports.set(config.id, transport)
            this.tools.push(...clientTools)

            logger.debug(`MCP client ${config.id} initialized with ${clientTools.length} tools`)
        } catch (error) {
            logger.error(`Failed to initialize MCP client ${config.id}: ${error}`)
            throw error
        }
    }

    /**
     * Gets all tools from all MCP clients
     * @returns Array of tools
     */
    public getTools(): Tool[] {
        return this.tools
    }

    /**
     * Gets all tools except write tools (fsWrite, executeBash)
     * @returns Array of tools excluding write tools
     */
    public getNoWriteTools(): Tool[] {
        return this.tools.filter((tool) => !['fsWrite', 'executeBash'].includes(tool.toolSpecification?.name || ''))
    }

    /**
     * Invokes a tool on the appropriate MCP client
     * @param toolName Name of the tool to invoke
     * @param params Parameters to pass to the tool
     * @returns Result of the tool invocation
     */
    public async invokeTool(toolName: string, params: any): Promise<any> {
        if (!this.initialized) {
            await this.initialize()
        }

        // Find the client that has this tool
        for (const [clientId, client] of this.clients.entries()) {
            try {
                const result = await client.invokeTool(toolName, params)
                return result
            } catch (error) {
                // If the error is because the tool doesn't exist on this client, continue to the next client
                if ((error as Error).message.includes('not found')) {
                    continue
                }
                // Otherwise, propagate the error
                throw error
            }
        }

        throw new Error(`Tool ${toolName} not found in any MCP client`)
    }

    /**
     * Disconnects all MCP clients
     */
    public async disconnect(): Promise<void> {
        for (const [clientId, client] of this.clients.entries()) {
            try {
                await client.disconnect()
                logger.debug(`Disconnected MCP client: ${clientId}`)
            } catch (error) {
                logger.error(`Error disconnecting MCP client ${clientId}: ${error}`)
            }
        }

        this.clients.clear()
        this.transports.clear()
        this.tools = []
        this.initialized = false
    }
}
