/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererGettingStartedTask,
} from '../../shared/telemetry/telemetry.gen'
import { GenerateRecommendationsRequest, ListRecommendationsRequest } from '../client/codewhisperer'
import { Position } from 'vscode'

import { CWFileContext, CWRecommendationEntry, CodeWhispererSupplementalContext } from '../models/model'

import { supplementalContextTimeoutInMs } from '../models/constants'
import {
    buildGenerateRecommendationRequest,
    buildListRecommendationRequest,
    extractContextForCodeWhisperer,
} from '../util/editorContext'
import { fetchSupplementalContext } from '../util/supplementalContext/supplementalContextUtil'

export class CWSession {
    sessionId: string = ''

    requestIds: string[] = []

    // Various states of recommendations
    recommendations: CWRecommendationEntry[] = []

    constructor(
        readonly language: CodewhispererLanguage,
        public fileContext: CWFileContext,
        public supplementalContext: CodeWhispererSupplementalContext | undefined,
        public taskType: CodewhispererGettingStartedTask | undefined,
        public request: ListRecommendationsRequest | GenerateRecommendationsRequest
    ) {}
}

const ON_START_SESSION = new CWSession(
    'plaintext',
    new CWFileContext('', 'plaintext', '', '', '', new vscode.Position(0, 0), 0),
    undefined,
    undefined,
    {
        fileContext: new CWFileContext('', 'plaintext', '', '', '', new vscode.Position(0, 0), 0).toSdkType(),
        nextToken: '',
        supplementalContexts: undefined,
    }
)

class CWSessionQueue {
    static #instance: CWSessionQueue

    // TODO: maybe add a isActiveWork method?

    // TODO: set size, we only want to cache 5 sessions for example
    private queue: CWSession[] = [ON_START_SESSION]

    currentSession(): CWSession {
        if (this.queue.length === 0) {
            throw new Error('empty queue')
        }

        return this.queue[this.queue.length - 1]
    }

    async startSession(
        editor: vscode.TextEditor,
        isPaginationRequired: boolean,
        isReference: boolean | undefined
    ): Promise<CWSession> {
        const fileContext = extractContextForCodeWhisperer(editor)
        const tokenSource = new vscode.CancellationTokenSource()
        setTimeout(() => {
            tokenSource.cancel()
        }, supplementalContextTimeoutInMs)
        const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)
        const taskType = await this.getTaskTypeFromEditorFileName(editor.document.fileName)

        let request: ListRecommendationsRequest | GenerateRecommendationsRequest
        if (isPaginationRequired) {
            request = await buildListRecommendationRequest(fileContext, supplementalContexts, isReference)
        } else {
            request = await buildGenerateRecommendationRequest(fileContext, supplementalContexts)
        }

        const session = new CWSession(
            fileContext.programmingLanguage,
            fileContext,
            supplementalContexts,
            taskType,
            request
        )

        this.queue.push(session)
        return session
    }

    async getTaskTypeFromEditorFileName(filePath: string): Promise<CodewhispererGettingStartedTask | undefined> {
        if (filePath.includes('CodeWhisperer_generate_suggestion')) {
            return 'autoTrigger'
        } else if (filePath.includes('CodeWhisperer_manual_invoke')) {
            return 'manualTrigger'
        } else if (filePath.includes('CodeWhisperer_use_comments')) {
            return 'commentAsPrompt'
        } else if (filePath.includes('CodeWhisperer_navigate_suggestions')) {
            return 'navigation'
        } else if (filePath.includes('Generate_unit_tests')) {
            return 'unitTest'
        } else {
            return undefined
        }
    }

    public static get instance() {
        return (this.#instance ??= new CWSessionQueue())
    }
}

export const CWSessionManager = CWSessionQueue.instance
