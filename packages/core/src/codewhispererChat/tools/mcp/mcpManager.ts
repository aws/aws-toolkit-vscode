/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ListToolsResponse, MCPConfig, MCPServerConfig } from './mcpTypes'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'

export interface McpToolDefinition {
    serverName: string
    toolName: string
    description: string
    inputSchema: any // schema from the server
}

export class McpManager {
    private mcpServers: Record<string, MCPServerConfig> = {}
    private clients: Map<string, Client> = new Map() // key: serverName, val: MCP client
    private mcpTools: McpToolDefinition[] = []

    private constructor(private configPath: string) {}

    public static async create(configPath: string): Promise<McpManager> {
        const instance = new McpManager(configPath)
        await instance.loadConfig()
        await instance.initAllServers()
        return instance
    }

    public async loadConfig(): Promise<void> {
        if (!(await fs.exists(this.configPath))) {
            throw new Error(`Could not load the MCP config at ${this.configPath}`)
        }
        const raw = await fs.readFileText(this.configPath)
        const json = JSON.parse(raw) as MCPConfig
        if (!json.mcpServers) {
            throw new Error(`No "mcpServers" field found in config: ${this.configPath}`)
        }
        this.mcpServers = json.mcpServers
    }

    public async initAllServers(): Promise<void> {
        for (const [serverName, serverConfig] of Object.entries(this.mcpServers)) {
            if (serverConfig.disabled) {
                getLogger().info(`MCP server [${serverName}] is disabled, skipping.`)
                continue
            }
            await this.initOneServer(serverName, serverConfig)
        }
    }

    private async initOneServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
        try {
            getLogger().debug(`Initializing MCP server [${serverName}] with command: ${serverConfig.command}`)
            const transport = new StdioClientTransport({
                command: serverConfig.command,
                args: serverConfig.args ?? [],
                env: process.env as Record<string, string>,
            })
            const client = new Client({
                name: `q-agentic-chat-mcp-client-${serverName}`,
                version: '1.0.0',
            })
            await client.connect(transport)
            this.clients.set(serverName, client)

            const toolsResult = (await client.listTools()) as ListToolsResponse
            for (const toolInfo of toolsResult.tools) {
                const toolDef: McpToolDefinition = {
                    serverName,
                    toolName: toolInfo.name ?? 'unknown',
                    description: toolInfo.description ?? '',
                    inputSchema: toolInfo.inputSchema ?? {},
                }
                this.mcpTools.push(toolDef)
                getLogger().info(`Found MCP tool [${toolDef.toolName}] from server [${serverName}]`)
            }
        } catch (err) {
            getLogger().error(`Failed to init server [${serverName}]: ${(err as Error).message}`)
        }
    }

    public getAllMcpTools(): McpToolDefinition[] {
        return [...this.mcpTools]
    }

    public async callTool(serverName: string, toolName: string, args: any): Promise<any> {
        const client = this.clients.get(serverName)
        if (!client) {
            throw new Error(`MCP server [${serverName}] not connected or not found in clients.`)
        }
        return await client.callTool({
            name: toolName,
            arguments: args,
        })
    }

    public findTool(toolName: string): McpToolDefinition | undefined {
        return this.mcpTools.find((t) => t.toolName === toolName)
    }
}
