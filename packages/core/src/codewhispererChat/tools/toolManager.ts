/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool, ToolResult, ToolUse } from '@amzn/codewhisperer-streaming'
import toolsJson from './tool_index.json'
import { getLogger } from '../../shared/logger'
import { MCPManager, MCPClientConfig } from '../clients/mcp/mcpManager'
import { ToolUtils, ToolType } from './toolUtils'
import * as vscode from 'vscode'
import { Writable } from 'stream'
import { InvokeOutput } from './toolShared'
import { CommandValidation } from './executeBash'
import { Change } from 'diff'

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

    /**
     * Gets the display name for a tool
     * @param tool The tool to get the display name for
     * @returns The display name for the tool
     */
    public displayName(tool: { type: ToolType; tool: any }): string {
        return ToolUtils.displayName(tool)
    }

    /**
     * Checks if a tool requires acceptance before execution
     * @param tool The tool to check
     * @returns CommandValidation object indicating if acceptance is required
     */
    public requiresAcceptance(tool: { type: ToolType; tool: any }): CommandValidation {
        return ToolUtils.requiresAcceptance(tool)
    }

    /**
     * Invokes a tool
     * @param tool The tool to invoke
     * @param updates Optional writable stream for updates
     * @param cancellationToken Optional cancellation token
     * @returns The result of the tool invocation
     */
    public async invoke(
        tool: { type: ToolType; tool: any },
        updates?: Writable,
        cancellationToken?: vscode.CancellationToken
    ): Promise<InvokeOutput> {
        return ToolUtils.invoke(tool, updates, cancellationToken)
    }

    /**
     * Validates the output of a tool
     * @param output The output to validate
     * @param toolType The type of tool
     */
    public validateOutput(output: InvokeOutput, toolType: ToolType): void {
        ToolUtils.validateOutput(output, toolType)
    }

    /**
     * Queues a description of a tool
     * @param tool The tool to describe
     * @param updates Writable stream for updates
     * @param requiresAcceptance Whether the tool requires acceptance
     */
    public async queueDescription(
        tool: { type: ToolType; tool: any },
        updates: Writable,
        requiresAcceptance: boolean
    ): Promise<void> {
        return ToolUtils.queueDescription(tool, updates, requiresAcceptance)
    }

    /**
     * Validates a tool
     * @param tool The tool to validate
     */
    public async validate(tool: { type: ToolType; tool: any }): Promise<void> {
        return ToolUtils.validate(tool)
    }

    /**
     * Tries to create a tool from a tool use
     * @param value The tool use to create a tool from
     * @returns The created tool or a tool result if creation failed
     */
    public tryFromToolUse(value: ToolUse): { type: ToolType; tool: any } | ToolResult {
        return ToolUtils.tryFromToolUse(value)
    }
}
