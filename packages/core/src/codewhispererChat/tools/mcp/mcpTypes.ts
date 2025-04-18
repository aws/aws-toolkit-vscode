/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MCPServerConfig {
    command: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
    autoApprove?: string[]
}

export interface MCPConfig {
    mcpServers: Record<string, MCPServerConfig>
}

export interface ListToolsResponse {
    tools: {
        name?: string
        description?: string
        inputSchema?: object
        [key: string]: any
    }[]
}
