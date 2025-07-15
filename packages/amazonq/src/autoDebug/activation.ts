/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from 'aws-core-vscode/shared'
import { AutoDebugLspClient } from './autoDebugLspClient'

const logger = getLogger('amazonqLsp')

/**
 * Creates and activates the AutoDebug LSP client using the exact same pattern as inline chat
 * This ensures perfect compatibility with the language server integration
 */
export function activateAutoDebug(client: LanguageClient, encryptionKey: Buffer): AutoDebugLspClient {
    // Create the AutoDebug LSP client using the normal chat pipeline
    const autoDebugClient = new AutoDebugLspClient(client)

    logger.info('AutoDebug: ✅ AutoDebug LSP client activated successfully')

    // Store globally for access from the core package
    ;(global as any).autoDebugLspClient = autoDebugClient
    return autoDebugClient
}

/**
 * Gets the globally stored AutoDebug LSP client
 */
export function getAutoDebugLspClient(): AutoDebugLspClient | undefined {
    return (global as any).autoDebugLspClient
}
