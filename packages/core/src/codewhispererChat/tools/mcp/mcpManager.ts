/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ListToolsResponse, MCPConfig, MCPServerConfig } from './mcpTypes'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'
import { tools } from '../../constants'
import { ToolType } from '../toolUtils'

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

    private constructor(private readonly configPath: string) {}

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
            // Log the error for this server but allow the initialization of others to continue.
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

    public static async initMcpManager(configPath: string): Promise<McpManager | undefined> {
        try {
            const manager = await McpManager.create(configPath)
            const discovered = manager.getAllMcpTools()
            const builtInNames = new Set<string>(Object.values(ToolType))
            const discoveredNames = new Set(discovered.map((d) => d.toolName))

            for (const def of discovered) {
                const spec = {
                    toolSpecification: {
                        name: def.toolName,
                        description: def.description,
                        inputSchema: { json: def.inputSchema },
                    },
                }
                const idx = tools.findIndex((t) => t.toolSpecification!.name === def.toolName)
                if (idx >= 0) {
                    // replace existing entry
                    tools[idx] = spec
                } else {
                    // append new entry
                    tools.push(spec)
                }
            }

            // Prune stale _dynamic_ tools (leave built‑ins intact)
            for (let i = tools.length - 1; i >= 0; --i) {
                const name = tools[i].toolSpecification!.name
                if (!name || builtInNames.has(name)) {
                    continue
                }
                // if it wasn’t rediscovered in new MCP config, remove it
                if (!discoveredNames.has(name)) {
                    tools.splice(i, 1)
                }
            }
            getLogger().info(`MCP: successfully discovered ${discovered.length} new tools.`)
            return manager
        } catch (err) {
            getLogger().error(`Failed to init MCP manager: ${(err as Error).message}`)
            return undefined
        }
    }

    // public async dispose(): Promise<void> {
    //     this.clients.clear()
    //     this.mcpTools = []
    // }
}
