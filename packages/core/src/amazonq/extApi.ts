/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../shared/utilities'
import { ToolkitError } from '../shared'
import { GenerateAssistantResponseCommandOutput, GenerateAssistantResponseRequest } from '@amzn/codewhisperer-streaming'
import { FeatureAuthState } from '../codewhisperer/util/authUtil'

export interface qAPI {
    chatApi: {
        chat(request: GenerateAssistantResponseRequest): Promise<GenerateAssistantResponseCommandOutput>
    }
    authApi: {
        reauthIfNeeded(): Promise<void>
        getChatAuthState(): Promise<FeatureAuthState>
    }
}

/**
 * Get the extension API for Q
 */
export async function getQAPI(): Promise<qAPI> {
    const ext = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.amazonq)
    if (!ext) {
        throw new ToolkitError('Amazon Q is not installed', { code: 'AmazonQNotInstalled' })
    }
    return ext.activate()
}
