/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Writable } from 'stream'
import { getLogger } from '../../../shared/logger/logger'
import { CommandValidation, InvokeOutput, OutputKind } from '../toolShared'
import { McpManager } from './mcpManager'

export interface McpToolParams {
    serverName: string
    toolName: string
    input?: any
}

export class McpTool {
    private readonly logger = getLogger('mcp')
    private serverName: string
    private toolName: string
    private input: any

    public constructor(params: McpToolParams) {
        this.serverName = params.serverName
        this.toolName = params.toolName
        this.input = params.input
    }

    public async validate(): Promise<void> {}

    public queueDescription(updates: Writable): void {
        updates.write(`Invoking remote MCP tool: ${this.toolName} on server ${this.serverName}`)
        updates.end()
    }

    public requiresAcceptance(): CommandValidation {
        return { requiresAcceptance: true }
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        try {
            const result = await McpManager.instance.callTool(this.serverName, this.toolName, this.input)
            const content = typeof result === 'object' ? JSON.stringify(result) : String(result)

            return {
                output: {
                    kind: OutputKind.Text,
                    content,
                },
            }
        } catch (error: any) {
            this.logger.error(`Failed to invoke MCP tool: ${error.message ?? error}`)
            throw new Error(`Failed to invoke MCP tool: ${error.message ?? error}`)
        }
    }
}
