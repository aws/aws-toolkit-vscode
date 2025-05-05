/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { InlineChatParams, InlineChatResult } from '@aws/language-server-runtimes-types'
import { inlineChatRequestType } from '@aws/language-server-runtimes/protocol'
import { PromptMessage } from 'aws-core-vscode/codewhispererChat'
import { getLogger, isAwsError } from 'aws-core-vscode/shared'
import { codeWhispererClient } from 'aws-core-vscode/codewhisperer'
import type { InlineChatEvent } from 'aws-core-vscode/codewhisperer'
import { InlineTask } from '../controller/inlineTask'
import { decodeRequest, encryptRequest } from '../../lsp/encryption'

export class InlineChatProvider {
    private errorEmitter = new vscode.EventEmitter<void>()
    public onErrorOccured = this.errorEmitter.event

    public constructor(
        private readonly client: LanguageClient,
        private readonly encryptionKey: Buffer
    ) {}

    public async processPromptMessage(message: PromptMessage) {
        const params = this.getCurrentEditorParams(message.message ?? '')
        this.client.info(`Logging request for inline chat ${JSON.stringify(params)}`)
        if (!params) {
            this.client.warn(`Invalid request params for inline chat`)
            return
        }
        try {
            const inlineChatRequest = await encryptRequest<InlineChatParams>(params, this.encryptionKey)
            const response = await this.client.sendRequest(inlineChatRequestType.method, inlineChatRequest)
            const result: InlineChatResult = response as InlineChatResult
            const decryptedMessage =
                typeof result === 'string' && this.encryptionKey
                    ? await decodeRequest(result, this.encryptionKey)
                    : result
            this.client.info(`Logging response for inline chat ${JSON.stringify(decryptedMessage)}`)

            // wait don't I have to listen for onProgress events here?
            // yes I think I do if the response is long
        } catch (e) {
            this.client.info(`Logging error for inline chat ${JSON.stringify(e)}`)
        }
    }

    private getCurrentEditorParams(prompt: string): InlineChatParams | undefined {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return undefined
        }

        // Get cursor position
        const position = editor.selection.active

        // Get document URI
        const documentUri = editor.document.uri.toString()

        const params: InlineChatParams = {
            prompt: {
                prompt,
            },
            cursorState: [
                {
                    position: {
                        line: position.line,
                        character: position.character,
                    },
                },
            ],
            textDocument: {
                uri: documentUri,
            },
        }

        return params
    }

    // private async generateResponse(
    //     triggerPayload: TriggerPayload & { projectContextQueryLatencyMs?: number },
    //     triggerID: string
    // ) {}

    // private processException(e: any, tabID: string) {}

    public sendTelemetryEvent(inlineChatEvent: InlineChatEvent, currentTask?: InlineTask) {
        codeWhispererClient
            .sendTelemetryEvent({
                telemetryEvent: {
                    inlineChatEvent: {
                        ...inlineChatEvent,
                        ...(currentTask?.inlineChatEventBase() ?? {}),
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendTelemetryEvent to CodeWhisperer, requestId: ${
                        requestId ?? ''
                    }, message: ${error.message}`
                )
            })
    }
}
