/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import * as CodeWhispererConstants from '../models/constants'
import globals from '../../shared/extensionGlobals'
import { vsCodeState } from '../models/model'
import { distance } from 'fastest-levenshtein'
import { CodewhispererLanguage, telemetry } from '../../shared/telemetry/telemetry'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import { AuthUtil } from '../util/authUtil'
import { CodeWhispererUserGroupSettings } from '../util/userGroupUtil'
import { getSelectedCustomization } from '../util/customizationUtil'
import { codeWhispererClient as client } from '../client/codewhisperer'
import { isAwsError } from '../../shared/errors'

interface CodeWhispererToken {
    range: vscode.Range
    text: string
    accepted: number
}

const autoClosingKeystrokeInputs = ['[]', '{}', '()', '""', "''"]

/**
 * This singleton class is mainly used for calculating the code written by codeWhisperer
 */
export class CodeWhispererCodeCoverageTracker {
    private _acceptedTokens: { [key: string]: CodeWhispererToken[] }
    private _totalTokens: { [key: string]: number }
    private _timer?: NodeJS.Timer
    private _startTime: number
    private _language: CodewhispererLanguage
    private _serviceInvocationCount: number

    private constructor(language: CodewhispererLanguage) {
        this._acceptedTokens = {}
        this._totalTokens = {}
        this._startTime = 0
        this._language = language
        this._serviceInvocationCount = 0
    }

    public get serviceInvocationCount(): number {
        return this._serviceInvocationCount
    }

    public get acceptedTokens(): { [key: string]: CodeWhispererToken[] } {
        return this._acceptedTokens
    }

    public get totalTokens(): { [key: string]: number } {
        return this._totalTokens
    }

    public isActive(): boolean {
        return TelemetryHelper.instance.isTelemetryEnabled() && AuthUtil.instance.isConnected()
    }

    public incrementServiceInvocationCount() {
        this._serviceInvocationCount += 1
    }

    public flush() {
        if (!this.isActive()) {
            this._totalTokens = {}
            this._acceptedTokens = {}
            this.closeTimer()
            return
        }
        try {
            this.emitCodeWhispererCodeContribution()
        } catch (error) {
            getLogger().error(`Encountered ${error} when emitting code contribution metric`)
        }
    }

    // TODO: Improve the range tracking of the accepted recommendation
    // TODO: use the editor of the filename, not the current editor
    public updateAcceptedTokensCount(editor: vscode.TextEditor) {
        const filename = editor.document.fileName
        if (filename in this._acceptedTokens) {
            for (let i = 0; i < this._acceptedTokens[filename].length; i++) {
                const oldText = this._acceptedTokens[filename][i].text
                const newText = editor.document.getText(this._acceptedTokens[filename][i].range)
                this._acceptedTokens[filename][i].accepted = this.getUnmodifiedAcceptedTokens(oldText, newText)
            }
        }
    }
    // With edit distance, complicate usermodification can be considered as simple edit(add, delete, replace),
    // and thus the unmodified part of recommendation length can be deducted/approximated
    // ex. (modified > original): originalRecom: foo -> modifiedRecom: fobarbarbaro, distance = 9, delta = 12 - 9 = 3
    // ex. (modified == original): originalRecom: helloworld -> modifiedRecom: HelloWorld, distance = 2, delta = 10 - 2 = 8
    // ex. (modified < original): originalRecom: CodeWhisperer -> modifiedRecom: CODE, distance = 12, delta = 13 - 12 = 1
    public getUnmodifiedAcceptedTokens(origin: string, after: string) {
        return Math.max(origin.length, after.length) - distance(origin, after)
    }

    public emitCodeWhispererCodeContribution() {
        let totalTokens = 0
        for (const filename in this._totalTokens) {
            totalTokens += this._totalTokens[filename]
        }
        if (vscode.window.activeTextEditor) {
            this.updateAcceptedTokensCount(vscode.window.activeTextEditor)
        }
        // the accepted characters without counting user modification
        let acceptedTokens = 0
        // the accepted characters after calculating user modificaiton
        let unmodifiedAcceptedTokens = 0
        for (const filename in this._acceptedTokens) {
            this._acceptedTokens[filename].forEach(v => {
                if (filename in this._totalTokens && this._totalTokens[filename] >= v.accepted) {
                    unmodifiedAcceptedTokens += v.accepted
                    acceptedTokens += v.text.length
                }
            })
        }
        const percentCount = ((acceptedTokens / totalTokens) * 100).toFixed(2)
        const percentage = Math.round(parseInt(percentCount))
        const selectedCustomization = getSelectedCustomization()
        if (this._serviceInvocationCount <= 0) {
            getLogger().debug(`Skip emiting code contribution metric`)
            return
        }
        telemetry.codewhisperer_codePercentage.emit({
            codewhispererTotalTokens: totalTokens,
            codewhispererLanguage: this._language,
            codewhispererAcceptedTokens: acceptedTokens,
            codewhispererPercentage: percentage ? percentage : 0,
            successCount: this._serviceInvocationCount,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            codewhispererCustomizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
        })

        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeCoverageEvent: {
                        customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(this._language),
                        },
                        acceptedCharacterCount: acceptedTokens,
                        unmodifiedAcceptedCharacterCount: unmodifiedAcceptedTokens,
                        totalCharacterCount: totalTokens,
                        timestamp: new Date(Date.now()),
                    },
                },
            })
            .then()
            .catch(error => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendTelemetryEvent to CodeWhisperer, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    private tryStartTimer() {
        if (this._timer !== undefined) {
            return
        }
        const currentDate = new globals.clock.Date()
        this._startTime = currentDate.getTime()
        this._timer = setTimeout(() => {
            try {
                const currentTime = new globals.clock.Date().getTime()
                const delay: number = CodeWhispererConstants.defaultCheckPeriodMillis
                const diffTime: number = this._startTime + delay
                if (diffTime <= currentTime) {
                    let totalTokens = 0
                    for (const filename in this._totalTokens) {
                        totalTokens += this._totalTokens[filename]
                    }
                    if (totalTokens > 0) {
                        this.flush()
                    } else {
                        getLogger().debug(
                            `CodeWhispererCodeCoverageTracker: skipped telemetry due to empty tokens array`
                        )
                    }
                }
            } catch (e) {
                getLogger().verbose(`Exception Thrown from CodeWhispererCodeCoverageTracker: ${e}`)
            } finally {
                this.resetTracker()
                this.closeTimer()
            }
        }, CodeWhispererConstants.defaultCheckPeriodMillis)
    }

    private resetTracker() {
        this._totalTokens = {}
        this._acceptedTokens = {}
        this._startTime = 0
        this._serviceInvocationCount = 0
    }

    private closeTimer() {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    public addAcceptedTokens(filename: string, token: CodeWhispererToken) {
        if (!(filename in this._acceptedTokens)) {
            this._acceptedTokens[filename] = []
        }
        this._acceptedTokens[filename].push(token)
    }

    public addTotalTokens(filename: string, count: number) {
        if (!(filename in this._totalTokens)) {
            this._totalTokens[filename] = 0
        }
        this._totalTokens[filename] += count
        if (this._totalTokens[filename] < 0) {
            this._totalTokens[filename] = 0
        }
    }

    public countAcceptedTokens(range: vscode.Range, text: string, filename: string) {
        if (!this.isActive()) {
            return
        }
        // generate accepted recommendation token and stored in collection
        this.addAcceptedTokens(filename, { range: range, text: text, accepted: text.length })
        this.addTotalTokens(filename, text.length)
    }

    // For below 2 edge cases
    // 1. newline character with indentation
    // 2. 2 character insertion of closing brackets
    public getCharacterCountFromComplexEvent(e: vscode.TextDocumentChangeEvent) {
        if (e.document.languageId === 'java' && e.contentChanges.length === 2) {
            const text1 = e.contentChanges[0].text
            const text2 = e.contentChanges[1].text
            if (text2.startsWith('\n') && text2.trim().length === 0) {
                return 1
            }
            if (autoClosingKeystrokeInputs.includes(text1)) {
                return 2
            }
        } else if (e.contentChanges.length === 1) {
            const text = e.contentChanges[0].text
            if (text.startsWith('\n') && text.trim().length === 0) {
                return 1
            }
            if (autoClosingKeystrokeInputs.includes(text)) {
                return 2
            }
        }
        return 0
    }

    public isFromUserKeystroke(e: vscode.TextDocumentChangeEvent) {
        return e.contentChanges.length === 1 && e.contentChanges[0].text.length === 1
    }

    public countTotalTokens(e: vscode.TextDocumentChangeEvent) {
        // ignore no contentChanges. ignore contentChanges from other plugins (formatters)
        // only include contentChanges from user keystroke input(one character input).
        // Also ignore deletion events due to a known issue of tracking deleted CodeWhiperer tokens.
        if (!runtimeLanguageContext.isLanguageSupported(e.document.languageId) || vsCodeState.isCodeWhispererEditing) {
            return
        }
        // a user keystroke input can be
        // 1. content change with 1 character insertion
        // 2. newline character with indentation
        // 3. 2 character insertion of closing brackets
        if (this.isFromUserKeystroke(e)) {
            this.tryStartTimer()
            this.addTotalTokens(e.document.fileName, 1)
        } else if (this.getCharacterCountFromComplexEvent(e) !== 0) {
            this.tryStartTimer()
            this.addTotalTokens(e.document.fileName, this.getCharacterCountFromComplexEvent(e))
        }
    }

    public static readonly instances = new Map<CodewhispererLanguage, CodeWhispererCodeCoverageTracker>()

    public static getTracker(
        language: string,
        memeto: vscode.Memento = globals.context.globalState
    ): CodeWhispererCodeCoverageTracker | undefined {
        if (!runtimeLanguageContext.isLanguageSupported(language)) {
            return undefined
        }
        const cwsprLanguage = runtimeLanguageContext.normalizeLanguage(language)
        if (!cwsprLanguage) {
            return undefined
        }
        const instance = this.instances.get(cwsprLanguage) ?? new this(cwsprLanguage)
        this.instances.set(cwsprLanguage, instance)
        return instance
    }
}
