/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { registerChatView } from './vue/chat/backend'
import { registerMemoryFileProvider } from './memoryFile'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await registerChatView(context)
    registerMemoryFileProvider(context)
}
