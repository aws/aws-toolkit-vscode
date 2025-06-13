/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { SendMessageCommandOutput, SendMessageRequest } from '@amzn/amazon-q-developer-streaming-client'
import { GenerateAssistantResponseCommandOutput, GenerateAssistantResponseRequest } from '@amzn/codewhisperer-streaming'
import { auth2 } from 'aws-core-vscode/auth'
import { ToolkitError } from '../shared/errors'

/**
 * @deprecated, for backwards comaptibility only.
 */
type OldAuthState = 'disconnected' | 'expired' | 'connected'

/**
 * This interface is used and exported by the amazon q extension. If you make a change here then
 * update the corresponding api implementation in packages/amazonq/src/api.ts
 */
export interface api {
    chatApi: {
        chat(request: GenerateAssistantResponseRequest): Promise<GenerateAssistantResponseCommandOutput>
        chatIam(request: SendMessageRequest): Promise<SendMessageCommandOutput>
    }
    authApi: {
        reauthIfNeeded(): Promise<void>
        /**
         * @deprecated, for backwards comaptibility only.
         */
        getChatAuthState(): Promise<{
            codewhispererCore: OldAuthState
            codewhispererChat: OldAuthState
            amazonQ: OldAuthState
        }>
        getAuthState(): auth2.AuthState
    }
}

export class AmazonqNotFoundError extends ToolkitError {
    constructor() {
        super(`${VSCODE_EXTENSION_ID.amazonq} is not installed`, { code: 'AmazonQNotInstalled' })
    }
}

/**
 * Get the extension API for Amazon q
 *
 * @returns The extension API for Amazon q, or undefined if the extension is not installed
 */
export async function getAmazonqApi(): Promise<api | undefined> {
    const ext = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.amazonq)
    if (!ext) {
        return undefined
    }
    return ext.activate()
}
