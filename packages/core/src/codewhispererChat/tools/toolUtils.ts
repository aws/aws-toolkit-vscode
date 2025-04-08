/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Writable } from 'stream'
import { FsRead, FsReadParams } from './fsRead'
import { FsWrite, FsWriteParams } from './fsWrite'
import { CommandValidation, ExecuteBash, ExecuteBashParams } from './executeBash'
import { ToolResult, ToolResultContentBlock, ToolResultStatus, ToolUse } from '@amzn/codewhisperer-streaming'
import { InvokeOutput, maxToolResponseSize } from './toolShared'
import { ListDirectory, ListDirectoryParams } from './listDirectory'
import { GrepSearch, GrepSearchParams } from './grepSearch'

export enum ToolType {
    FsRead = 'fsRead',
    FsWrite = 'fsWrite',
    ExecuteBash = 'executeBash',
    ListDirectory = 'listDirectory',
    GrepSearch = 'grepSearch',
}

export type Tool =
    | { type: ToolType.FsRead; tool: FsRead }
    | { type: ToolType.FsWrite; tool: FsWrite }
    | { type: ToolType.ExecuteBash; tool: ExecuteBash }
    | { type: ToolType.ListDirectory; tool: ListDirectory }
    | { type: ToolType.GrepSearch; tool: GrepSearch }

export class ToolUtils {
    static displayName(tool: Tool): string {
        switch (tool.type) {
            case ToolType.FsRead:
                return 'Read from filesystem'
            case ToolType.FsWrite:
                return 'Write to filesystem'
            case ToolType.ExecuteBash:
                return 'Execute shell command'
            case ToolType.ListDirectory:
                return 'List directory from filesystem'
            case ToolType.GrepSearch:
                return 'Run Fast text-based regex search'
        }
    }

    static requiresAcceptance(tool: Tool): CommandValidation {
        switch (tool.type) {
            case ToolType.FsRead:
                return { requiresAcceptance: false }
            case ToolType.FsWrite:
                return { requiresAcceptance: false }
            case ToolType.ExecuteBash:
                return tool.tool.requiresAcceptance()
            case ToolType.ListDirectory:
                return { requiresAcceptance: false }
            case ToolType.GrepSearch:
                return { requiresAcceptance: false }
        }
    }

    static async invoke(tool: Tool, updates?: Writable): Promise<InvokeOutput> {
        switch (tool.type) {
            case ToolType.FsRead:
                return tool.tool.invoke(updates)
            case ToolType.FsWrite:
                return tool.tool.invoke(updates)
            case ToolType.ExecuteBash:
                return tool.tool.invoke(updates ?? undefined)
            case ToolType.ListDirectory:
                return tool.tool.invoke(updates)
            case ToolType.GrepSearch:
                return tool.tool.invoke(updates)
        }
    }

    static validateOutput(output: InvokeOutput): void {
        if (output.output.content.length > maxToolResponseSize) {
            throw Error(`Tool output exceeds maximum character limit of ${maxToolResponseSize}`)
        }
    }

    static async queueDescription(tool: Tool, updates: Writable): Promise<void> {
        switch (tool.type) {
            case ToolType.FsRead:
                tool.tool.queueDescription(updates)
                break
            case ToolType.FsWrite:
                await tool.tool.queueDescription(updates)
                break
            case ToolType.ExecuteBash:
                tool.tool.queueDescription(updates)
                break
            case ToolType.ListDirectory:
                tool.tool.queueDescription(updates)
                break
            case ToolType.GrepSearch:
                tool.tool.queueDescription(updates)
                break
        }
    }

    static async validate(tool: Tool): Promise<void> {
        switch (tool.type) {
            case ToolType.FsRead:
                return tool.tool.validate()
            case ToolType.FsWrite:
                return tool.tool.validate()
            case ToolType.ExecuteBash:
                return tool.tool.validate()
            case ToolType.ListDirectory:
                return tool.tool.validate()
            case ToolType.GrepSearch:
                return tool.tool.validate()
        }
    }

    static tryFromToolUse(value: ToolUse): Tool | ToolResult {
        const mapErr = (parseError: any): ToolResult => ({
            toolUseId: value.toolUseId,
            content: [
                {
                    type: 'text',
                    text: `Failed to validate tool parameters: ${parseError}. The model has either suggested tool parameters which are incompatible with the existing tools, or has suggested one or more tool that does not exist in the list of known tools.`,
                } as ToolResultContentBlock,
            ],
            status: ToolResultStatus.ERROR,
        })

        try {
            switch (value.name) {
                case ToolType.FsRead:
                    return {
                        type: ToolType.FsRead,
                        tool: new FsRead(value.input as unknown as FsReadParams),
                    }
                case ToolType.FsWrite:
                    return {
                        type: ToolType.FsWrite,
                        tool: new FsWrite(value.input as unknown as FsWriteParams),
                    }
                case ToolType.ExecuteBash:
                    return {
                        type: ToolType.ExecuteBash,
                        tool: new ExecuteBash(value.input as unknown as ExecuteBashParams),
                    }
                case ToolType.ListDirectory:
                    return {
                        type: ToolType.ListDirectory,
                        tool: new ListDirectory(value.input as unknown as ListDirectoryParams),
                    }
                case ToolType.GrepSearch:
                    return {
                        type: ToolType.GrepSearch,
                        tool: new GrepSearch(value.input as unknown as GrepSearchParams),
                    }
                default:
                    return {
                        toolUseId: value.toolUseId,
                        content: [
                            {
                                type: 'text',
                                text: `The tool, "${value.name}" is not supported by the client`,
                            } as ToolResultContentBlock,
                        ],
                    }
            }
        } catch (error) {
            return mapErr(error)
        }
    }
}
