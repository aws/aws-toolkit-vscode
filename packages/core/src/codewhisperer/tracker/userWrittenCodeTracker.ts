/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { AuthUtil } from '../util/authUtil'
import { getSelectedCustomization } from '../util/customizationUtil'
import { codeWhispererClient as client } from '../client/codewhisperer'
import { isAwsError } from '../../shared/errors'
import { undefinedIfEmpty } from '../../shared/utilities/textUtilities'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry'
import globals from '../../shared/extensionGlobals'

/**
 * This singleton class is mainly used for calculating the user written code
 * for active Amazon Q users.
 * It reports the user written code per 5 minutes when the user is coding and using Amazon Q features
 */
export class UserWrittenCodeTracker {
    private _userWrittenNewCodeCharacterCount: Map<CodewhispererLanguage, number>
    private _userWrittenNewCodeLineCount: Map<CodewhispererLanguage, number>
    private _qIsMakingEdits: boolean
    private _timer?: NodeJS.Timer
    private _qUsageCount: number
    private _lastQInvocationTime: number

    static #instance: UserWrittenCodeTracker
    private static copySnippetThreshold = 50
    private static resetQIsEditingTimeoutMs = 2 * 60 * 1000
    private static defaultCheckPeriodMillis = 5 * 60 * 1000

    private constructor() {
        this._userWrittenNewCodeLineCount = new Map<CodewhispererLanguage, number>()
        this._userWrittenNewCodeCharacterCount = new Map<CodewhispererLanguage, number>()
        this._qUsageCount = 0
        this._qIsMakingEdits = false
        this._timer = undefined
        this._lastQInvocationTime = 0
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public isActive(): boolean {
        return globals.telemetry.telemetryEnabled && AuthUtil.instance.isConnected()
    }

    // this should be invoked whenever there is a successful Q feature invocation
    // for all Q features
    public onQFeatureInvoked() {
        this._qUsageCount += 1
        this._lastQInvocationTime = performance.now()
    }

    public onQStartsMakingEdits() {
        this._qIsMakingEdits = true
    }

    public onQFinishesEdits() {
        this._qIsMakingEdits = false
    }

    public getUserWrittenCharacters(language: CodewhispererLanguage) {
        return this._userWrittenNewCodeCharacterCount.get(language) || 0
    }

    public getUserWrittenLines(language: CodewhispererLanguage) {
        return this._userWrittenNewCodeLineCount.get(language) || 0
    }

    public reset() {
        this._userWrittenNewCodeLineCount = new Map<CodewhispererLanguage, number>()
        this._userWrittenNewCodeCharacterCount = new Map<CodewhispererLanguage, number>()
        this._qUsageCount = 0
        this._qIsMakingEdits = false
        this._lastQInvocationTime = 0
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    public emitCodeContributions() {
        const selectedCustomization = getSelectedCustomization()

        for (const [language, charCount] of this._userWrittenNewCodeCharacterCount) {
            const lineCount = this.getUserWrittenLines(language)
            if (charCount > 0) {
                client
                    .sendTelemetryEvent({
                        telemetryEvent: {
                            codeCoverageEvent: {
                                customizationArn: undefinedIfEmpty(selectedCustomization.arn),
                                programmingLanguage: {
                                    languageName: runtimeLanguageContext.toRuntimeLanguage(language),
                                },
                                acceptedCharacterCount: 0,
                                totalCharacterCount: 0,
                                timestamp: new Date(Date.now()),
                                userWrittenCodeCharacterCount: charCount,
                                userWrittenCodeLineCount: lineCount,
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
                            `Failed to sendTelemetryEvent, requestId: ${requestId ?? ''}, message: ${error.message}`
                        )
                    })
            }
        }
    }

    private tryStartTimer() {
        if (this._timer !== undefined) {
            return
        }
        if (!this.isActive()) {
            getLogger().debug(`Skip emiting code contribution metric. Telemetry disabled or not logged in. `)
            this.reset()
            return
        }
        const startTime = performance.now()
        this._timer = setTimeout(() => {
            try {
                const currentTime = performance.now()
                const delay: number = UserWrittenCodeTracker.defaultCheckPeriodMillis
                const diffTime: number = startTime + delay
                if (diffTime <= currentTime) {
                    if (this._qUsageCount <= 0) {
                        getLogger().debug(`Skip emiting code contribution metric. There is no active Amazon Q usage. `)
                        return
                    }
                    if (this._userWrittenNewCodeCharacterCount.size === 0) {
                        getLogger().debug(`Skip emiting code contribution metric. There is no new code added. `)
                        return
                    }
                    this.emitCodeContributions()
                }
            } catch (e) {
                getLogger().verbose(`Exception Thrown from QCodeGenTracker: ${e}`)
            } finally {
                this.reset()
            }
        }, UserWrittenCodeTracker.defaultCheckPeriodMillis)
    }

    private countNewLines(str: string) {
        return str.split('\n').length - 1
    }

    public onTextDocumentChange(e: vscode.TextDocumentChangeEvent) {
        // do not count code written by Q as user written code
        if (
            !runtimeLanguageContext.isLanguageSupported(e.document.languageId) ||
            e.contentChanges.length === 0 ||
            this._qIsMakingEdits
        ) {
            // if the boolean of qIsMakingEdits was incorrectly set to true
            // due to unhandled edge cases or early terminated code paths
            // reset it back to false after a reasonable period of time
            if (this._qIsMakingEdits) {
                if (performance.now() - this._lastQInvocationTime > UserWrittenCodeTracker.resetQIsEditingTimeoutMs) {
                    getLogger().warn(`Reset Q is editing state to false.`)
                    this._qIsMakingEdits = false
                }
            }
            return
        }
        const contentChange = e.contentChanges[0]
        // if user copies code into the editor for more than 50 characters
        // do not count this as total new code, this will skew the data,
        // reporting highly inflated user written code
        if (contentChange.text.length > UserWrittenCodeTracker.copySnippetThreshold) {
            return
        }
        const language = runtimeLanguageContext.normalizeLanguage(e.document.languageId)
        if (language) {
            const charCount = this.getUserWrittenCharacters(language)
            this._userWrittenNewCodeCharacterCount.set(language, charCount + contentChange.text.length)
            const lineCount = this.getUserWrittenLines(language)
            this._userWrittenNewCodeLineCount.set(language, lineCount + this.countNewLines(contentChange.text))
            // start 5 min data reporting once valid user input is detected
            this.tryStartTimer()
        }
    }
}
