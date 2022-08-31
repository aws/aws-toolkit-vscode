/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { CodeWhispererConstants } from '../models/constants'
import globals from '../../shared/extensionGlobals'
import { vsCodeState } from '../models/model'
import { distance } from 'fastest-levenshtein'
import { CodewhispererLanguage, telemetry } from '../../shared/telemetry/telemetry'

interface CodeWhispererToken {
    range: vscode.Range
    text: string
    accepted: number
}

/**
 * This singleton class is mainly used for calculating the code written by codeWhisperer
 */
export class CodeWhispererCodeCoverageTracker {
    private _acceptedTokens: { [key: string]: CodeWhispererToken[] }
    private _totalTokens: { [key: string]: number }
    private _timer?: NodeJS.Timer
    private _startTime: number
    private _language: CodewhispererLanguage

    private constructor(language: CodewhispererLanguage, private readonly _globals: vscode.Memento) {
        this._acceptedTokens = {}
        this._totalTokens = {}
        this._startTime = 0
        this._language = language
    }

    public get acceptedTokens(): { [key: string]: CodeWhispererToken[] } {
        return this._acceptedTokens
    }
    public get totalTokens(): { [key: string]: number } {
        return this._totalTokens
    }

    public countAcceptedTokens(range: vscode.Range, text: string, filename: string) {
        const terms = this._globals.get<boolean>(CodeWhispererConstants.termsAcceptedKey) || false
        if (!terms) return
        // generate accepted recommendation token and stored in collection
        this.addAcceptedTokens(filename, { range: range, text: text, accepted: text.length })
        this.addTotalTokens(filename, text.length)
    }

    public flush() {
        const terms = this._globals.get<boolean>(CodeWhispererConstants.termsAcceptedKey) || false
        if (!terms) {
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
        let acceptedTokens = 0
        for (const filename in this._acceptedTokens) {
            this._acceptedTokens[filename].forEach(v => {
                if (filename in this._totalTokens && this._totalTokens[filename] >= v.accepted) {
                    acceptedTokens += v.accepted
                }
            })
        }
        const percentCount = ((acceptedTokens / totalTokens) * 100).toFixed(2)
        const percentage = Math.round(parseInt(percentCount))
        telemetry.codewhisperer_codePercentage.emit({
            codewhispererTotalTokens: totalTokens,
            codewhispererLanguage: this._language,
            codewhispererAcceptedTokens: acceptedTokens,
            codewhispererPercentage: percentage ? percentage : 0,
        })
    }

    private tryStartTimer() {
        if (this._timer !== undefined) return
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
                this._totalTokens = {}
                this._acceptedTokens = {}
                this._startTime = 0
                this.closeTimer()
            }
        }, CodeWhispererConstants.defaultCheckPeriodMillis)
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

    public countTotalTokens(e: vscode.TextDocumentChangeEvent) {
        // ignore no contentChanges. ignore contentChanges from other plugins (formatters)
        // only include contentChanges from user action
        if (
            !CodeWhispererConstants.supportedLanguages.includes(e.document.languageId) ||
            vsCodeState.isCodeWhispererEditing ||
            e.contentChanges.length !== 1
        )
            return
        const content = e.contentChanges[0]
        // do not count user tokens if user copies large chunk of code
        if (content.text.length > 20) return
        this.tryStartTimer()
        // deletion events has no text.
        if (content.text.length === 0) {
            this.addTotalTokens(e.document.fileName, -content.rangeLength)
        } else {
            this.addTotalTokens(e.document.fileName, content.text.length)
        }
    }

    public static readonly instances = new Map<string, CodeWhispererCodeCoverageTracker>()
    public static getTracker(language: string, memento: vscode.Memento): CodeWhispererCodeCoverageTracker | undefined {
        if (CodeWhispererConstants.supportedLanguages.includes(language)) {
            const instance = this.instances.get(language) ?? new this(language as CodewhispererLanguage, memento)
            this.instances.set(language, instance)
            return instance
        }
        return undefined
    }
}
