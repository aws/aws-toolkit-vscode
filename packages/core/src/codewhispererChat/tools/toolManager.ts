/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool } from '@amzn/codewhisperer-streaming'
import toolsJson from './tool_index.json'
import { getLogger } from '../../shared/logger'
import { MCPManager, MCPClientConfig } from '../clients/mcp/mcpManager'

const logger = getLogger()

/**
 * Manages tools from local and MCP sources
 */
export class ToolManager {
    private static instance: ToolManager
    private localTools: Tool[] = []
    private mcpTools: Tool[] = []
    private mcpManager!: MCPManager

    private constructor() {
        this.initializeLocalTools()
        this.initializeMcpManager()
    }

    /**
     * Gets the singleton instance of ToolManager
     */
    public static getInstance(): ToolManager {
        if (!ToolManager.instance) {
            ToolManager.instance = new ToolManager()
        }
        return ToolManager.instance
    }

    /**
     * Initializes local tools from tool_index.json
     */
    private initializeLocalTools(): void {
        this.localTools = Object.entries(toolsJson).map(([, toolSpec]) => ({
            toolSpecification: {
                ...toolSpec,
                inputSchema: { json: toolSpec.inputSchema },
            },
        }))
        logger.debug(`Initialized ${this.localTools.length} local tools`)
    }

    /**
     * Initializes the MCP Manager with predefined client configurations
     */
    private initializeMcpManager(): void {
        const clientConfigs: MCPClientConfig[] = [
            {
                id: 'amzn-mcp',
                command: 'amzn-mcp',
                args: [],
            },
            // {
            //     id: 'anthropic-mcp',
            //     command: 'anthropic-mcp',
            //     args: ['--model', 'claude-3-opus'],
            // },
            // Add more client configurations as needed
        ]

        // Create MCP manager - it will initialize itself in the constructor
        this.mcpManager = new MCPManager(clientConfigs)

        // Get the initial tools
        this.mcpTools = this.mcpManager.getTools()
        logger.debug(`Created MCP Manager with ${this.mcpTools.length} initial tools`)
    }

    /**
     * Gets all tools (local and MCP)
     * @returns All tools
     */
    public getAllTools(): Tool[] {
        // Get the latest tools from the MCP manager if it exists
        // The MCP manager is now initialized in its constructor
        if (this.mcpManager) {
            this.mcpTools = this.mcpManager.getTools()
        }

        const allTools = [...this.localTools, ...this.mcpTools]
        console.debug(`Total tools available: ${allTools}`)
        return allTools
    }

    /**
     * Gets all tools except write tools (fsWrite, executeBash)
     * @returns All tools except write tools
     */
    public getNoWriteTools(): Tool[] {
        return this.getAllTools().filter(
            (tool) => !['fsWrite', 'executeBash'].includes(tool.toolSpecification?.name || '')
        )
    }
}
