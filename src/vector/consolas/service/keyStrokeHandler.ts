/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { extensionVersion } from '../../../shared/vscode/env'
import {
    RecommendationsList,
    GenerateRecommendationsResponse,
    DefaultConsolasClient,
    ConsolasGenerateRecommendationsReq,
} from '../client/consolas'
import * as EditorContext from '../util/editorContext'
import { ConsolasConstants } from '../models/constants'
import { recommendations, invocationContext, automatedTriggerContext, telemetryContext } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { onRejection } from '../commands/onRejection'
import { AWSError } from 'aws-sdk'
import { TelemetryHelper } from '../util/telemetryHelper'
import { getLogger } from '../../../shared/logger'
import { UnsupportedLanguagesCache } from '../util/unsupportedLanguagesCache'
import { showTimedMessage } from '../../../shared/utilities/messages'

//if this is browser it uses browser and if it's node then it uses nodes
//TODO remove when node version >= 16
const performance = globalThis.performance ?? require('perf_hooks').performance

export async function processKeyStroke(
    event: vscode.TextDocumentChangeEvent,
    editor: vscode.TextEditor,
    client: DefaultConsolasClient,
    isManualTriggerEnabled: boolean,
    isAutomatedTriggerEnabled: boolean
): Promise<void> {
    try {
        const changedText = getChangedText(event, isAutomatedTriggerEnabled, editor)
        if (changedText === '') {
            return
        }
        const autoTriggerType = getAutoTriggerReason(changedText)
        if (autoTriggerType === '') {
            return
        }
        const triggerTtype = autoTriggerType as telemetry.ConsolasAutomatedtriggerType
        invokeAutomatedTrigger(triggerTtype, editor, client, isManualTriggerEnabled, isAutomatedTriggerEnabled)
    } catch (error) {
        getLogger().error('Automated Trigger Exception : ', error)
        getLogger().verbose(`Automated Trigger Exception : ${error}`)
    }
}

function getAutoTriggerReason(changedText: string): string {
    for (const val of ConsolasConstants.SPECIAL_CHARACTERS_LIST) {
        if (changedText.includes(val)) {
            automatedTriggerContext.specialChar = val

            if (val === ConsolasConstants.LINE_BREAK) {
                return 'Enter'
            } else {
                return 'SpecialCharacters'
            }
        }
    }
    if (changedText.includes(ConsolasConstants.SPACE)) {
        let isTab = true
        let space = 0
        for (let i = 0; i < changedText.length; i++) {
            if (changedText[i] !== ' ') {
                isTab = false
                break
            } else {
                space++
            }
        }
        if (isTab && space > 1 && space <= EditorContext.getTabSize()) {
            return 'SpecialCharacters'
        }
    }
    if (automatedTriggerContext.keyStrokeCount === ConsolasConstants.INVOCATION_KEY_THRESHOLD) {
        return 'KeyStrokeCount'
    } else {
        automatedTriggerContext.keyStrokeCount += 1
    }
    return ''
}

function getChangedText(
    event: vscode.TextDocumentChangeEvent,
    isAutomatedTriggerEnabled: boolean,
    editor: vscode.TextEditor
): string {
    if (!isAutomatedTriggerEnabled) {
        return ''
    }

    /**
     * Pause automated trigger when typed input matches recommendation prefix
     */
    const isMatchedPrefix = checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(true, editor)
    if (invocationContext.isActive && isMatchedPrefix.length > 0) {
        return ''
    }

    /**
     * DO NOT auto trigger Consolas when appending muli-line snippets to document
     * DO NOT auto trigger Consolas when deleting or undo
     */
    const changedText = event.contentChanges[0].text
    const changedRange = event.contentChanges[0].range
    if (!changedRange.isSingleLine || changedText === '') {
        return ''
    }

    /**
     * Time duration between 2 invations should be greater than the threshold
     */
    const duration = Math.floor((performance.now() - invocationContext.lastInvocationTime) / 1000)
    if (duration < ConsolasConstants.INVOCATION_TIME_INTERVAL_THRESHOLD) {
        return ''
    }

    return changedText
}

export async function invokeAutomatedTrigger(
    autoTriggerType: telemetry.ConsolasAutomatedtriggerType,
    editor: vscode.TextEditor,
    client: DefaultConsolasClient,
    isManualTriggerEnabled: boolean,
    isAutomatedTriggerEnabled: boolean,
    overrideGetRecommendations = getRecommendations
): Promise<void> {
    /**
     * Reject previous recommendations if there are ACTIVE ones
     */

    await onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
    if (editor) {
        recommendations.response = await overrideGetRecommendations(
            client,
            editor,
            'AutoTrigger',
            isManualTriggerEnabled,
            autoTriggerType
        )
        automatedTriggerContext.keyStrokeCount = 0
        /**
         * Swallow "no recommendations case" for automated trigger
         */
        const isMatchedPrefix = checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(true, editor)
        if (isMatchedPrefix.length > 0) {
            vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                invocationContext.isActive = true
            })
        }
    }
}

export async function getRecommendations(
    client: DefaultConsolasClient,
    editor: vscode.TextEditor,
    triggerType: telemetry.ConsolasTriggerType,
    isManualTriggerOn: boolean,
    autoTriggerType?: telemetry.ConsolasAutomatedtriggerType,
    overrideGetServiceResponse = getServiceResponse
): Promise<RecommendationsList> {
    /**
     * Record user decision on previous recommendations before getting new ones
     */
    TelemetryHelper.recordUserDecisionTelemetry(-1, editor?.document.languageId)

    let recommendation: RecommendationsList = []
    let invocationResult: telemetry.Result = 'Failed'
    let requestId = ''
    let reason = ''
    let completionType: telemetry.ConsolasCompletionType = 'Line'
    let startTime = 0
    let latency = 0
    const req = EditorContext.buildRequest(editor as vscode.TextEditor)
    try {
        startTime = performance.now()
        invocationContext.lastInvocationTime = startTime
        /**
         * Validate request
         */

        if (EditorContext.validateRequest(req)) {
            const resp = await overrideGetServiceResponse(client, req, triggerType, isManualTriggerOn)
            latency = startTime !== 0 ? performance.now() - startTime : 0
            recommendation = (resp && resp.recommendations) || []
            getLogger().info('Consolas Recommendations : ', recommendation)
            invocationResult = 'Succeeded'
            telemetryContext.triggerType = triggerType
            telemetryContext.ConsolasAutomatedtriggerType =
                autoTriggerType === undefined ? 'KeyStrokeCount' : autoTriggerType
            if (recommendation.length > 0 && recommendation[0].content.search(ConsolasConstants.LINE_BREAK) !== -1) {
                completionType = 'Block'
            }
            telemetryContext.completionType = completionType
            requestId = resp?.$response && resp?.$response?.requestId
        } else {
            getLogger().info('Invalid Request : ', JSON.stringify(req, undefined, EditorContext.getTabSize()))
            getLogger().verbose(`Invalid Request : ${JSON.stringify(req, undefined, EditorContext.getTabSize())}`)
        }
    } catch (error) {
        if (latency === 0) {
            latency = startTime !== 0 ? performance.now() - startTime : 0
        }
        getLogger().error('Consolas Invocation Exception : ', error)
        getLogger().verbose(`Consolas Invocation Exception : ${error}`)
        /**
         * TODO: how to cast to AWSError type-safely
         */
        const awsError = error as AWSError
        if (
            awsError.code === 'ValidationException' &&
            awsError.message.includes(`contextInfo.programmingLanguage.languageName`)
        ) {
            let languageName = req.contextInfo.programmingLanguage.languageName
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage(languageName)
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            languageName = `${languageName.charAt(0).toUpperCase()}${languageName.slice(1)}`
            showTimedMessage(`Programming language ${languageName} is currently not supported by Consolas`, 2000)
        }
        requestId = awsError.requestId || ''
        reason = `Consolas Invocation Exception: ${awsError?.code ?? awsError?.name ?? 'unknown'}`
    } finally {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const languageId = editor?.document?.languageId
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        getLogger().verbose(
            `Request ID: ${requestId}, timestamp(epoch): ${Date.now()}, timezone: ${timezone}, datetime: ${new Date().toLocaleString(
                [],
                { timeZone: timezone }
            )}, vscode version: '${
                vscode.version
            }', extension version: '${extensionVersion}', filename: '${EditorContext.getFileName(
                editor
            )}', left context of line:  '${EditorContext.getLeftContext(
                editor,
                invocationContext.startPos.line
            )}', line number: ${invocationContext.startPos.line}, character location: ${
                invocationContext.startPos.character
            }, latency: ${latency} ms.`
        )
        getLogger().verbose('Recommendations:')
        recommendation.forEach((item, index) => {
            getLogger().verbose(`[${index}]\n${item.content.trimRight()}`)
        })

        /**
         * TODO: fill in runtime fields after solution is found to access runtime in vscode
         */
        telemetry.recordConsolasServiceInvocation({
            consolasRequestId: requestId,
            consolasTriggerType: triggerType,
            consolasAutomatedtriggerType: autoTriggerType,
            consolasCompletionType: invocationResult == 'Succeeded' ? telemetryContext.completionType : undefined,
            result: invocationResult,
            duration: latency,
            consolasLineNumber: invocationContext.startPos.line,
            consolasCursorOffset: telemetryContext.cursorOffset,
            consolasLanguage: languageContext.language,
            consolasRuntime: languageContext.runtimeLanguage,
            consolasRuntimeSource: languageContext.runtimeLanguageSource,
            reason: reason,
        })
        recommendations.requestId = requestId
    }
    return recommendation
}

/**
 * VScode IntelliSense has native matching for recommendation.
 * This is only to check if the recommendation match the updated left context when
 * user keeps typing before getting consolas response back.
 * @param newConsolasRequest if newConsolasRequest, then we need to reset the invocationContext.isPrefixMatched, which is used as
 *                           part of user decision telemetry (see models.ts for more details)
 * @param editor the current VSCode editor
 *
 * @returns
 */
export function checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(
    newConsolasRequest: boolean,
    editor: vscode.TextEditor | undefined
): boolean[] {
    // let matched = false
    let typedPrefix = ''
    const isPrefixMatched: boolean[] = []
    if (newConsolasRequest) {
        telemetryContext.isPrefixMatched = []
    }

    if (!editor && !isValidResponse(recommendations.response)) {
        return isPrefixMatched
    }
    if (editor) {
        if (invocationContext.startPos.line !== editor.selection.active.line) {
            return isPrefixMatched
        }
        typedPrefix = editor.document.getText(new vscode.Range(invocationContext.startPos, editor.selection.active))
    }
    recommendations.response.forEach(recommendation => {
        if (recommendation.content.startsWith(typedPrefix)) {
            //  matched = true

            /**
             * TODO: seems like VScode has native prefix matching for completion items
             * if this behavior is changed, then we need to update the string manually
             * e.g., recommendation.content = recommendation.content.substring(changedContextLength)
             */

            if (newConsolasRequest) {
                isPrefixMatched.push(true)
            }
        } else {
            if (newConsolasRequest) {
                isPrefixMatched.push(false)
            }
        }
    })

    // return matched
    return isPrefixMatched
}

export function isValidResponse(response: RecommendationsList): boolean {
    return (
        response !== undefined && response.length > 0 && response.filter(option => option.content.length > 0).length > 0
    )
}
export async function getServiceResponse(
    client: DefaultConsolasClient,
    req: ConsolasGenerateRecommendationsReq,
    triggerType: telemetry.ConsolasTriggerType,
    isManualTriggerOn: boolean
): Promise<any> {
    if (isManualTriggerOn && triggerType === 'OnDemand') {
        invocationContext.isPendingResponse = true
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: ConsolasConstants.PENDING_RESPONSE,
                cancellable: false,
            },
            async () => {
                const consolasPromise = client.generateRecommendations(req).finally(() => {
                    invocationContext.isPendingResponse = false
                })
                return await asyncCallWithTimeout(consolasPromise, ConsolasConstants.PROMISE_TIMEOUT_LIMIT * 1000)
            }
        )
    } else {
        return client.generateRecommendations(req).then(result => {
            return result
        })
    }
}

/**
 * Call an async function with a maximum time limit (in milliseconds) for the timeout
 * @param {Promise<T>} asyncPromise An asynchronous promise to resolve
 * @param {number} timeLimit Time limit to attempt function in milliseconds
 * @returns {Promise<T> | undefined} Resolved promise for async function call, or an error if time limit reached
 */
export async function asyncCallWithTimeout<T extends GenerateRecommendationsResponse>(
    asyncPromise: Promise<T>,
    timeLimit: number
): Promise<T> {
    let timeoutHandle: NodeJS.Timeout
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Consolas promise timed out')), timeLimit)
    })
    return Promise.race([asyncPromise, timeoutPromise]).then(result => {
        clearTimeout(timeoutHandle)
        return result as T
    })
}
