/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { getLogger } from '../../../shared/logger/logger'
import { ConsolasConstants } from '../models/constants'
import globals from '../../../shared/extensionGlobals'
/**
 * This singleton class is mainly used for calculating the percentage of user modification.
 * The current calculation method is (Levenshtein edit distance / acceptedSuggestion.length).
 */
export class ConsolasCodeCoverageTracker {
    private _acceptedTokens: string[]
    private _totalTokens: string[]
    private _timer?: NodeJS.Timer
    private _startTime: number
    private _language: telemetry.ConsolasLanguage

    private constructor(language: telemetry.ConsolasLanguage, private readonly _globals: vscode.Memento) {
        this._acceptedTokens = []
        this._totalTokens = []
        this._startTime = 0
        this._language = language
    }

    public setAcceptedTokens(recommendation: string) {
        const terms = this._globals.get<boolean>(ConsolasConstants.termsAcceptedKey) || false
        if (!terms) return

        // generate accepted recoomendation token and stored in collection
        this._acceptedTokens.push(...recommendation)
    }

    public get AcceptedTokensLength(): number {
        return this._acceptedTokens.length
    }

    public setTotalTokens(content: string) {
        if (this._totalTokens.length === 0 && this._timer == undefined) {
            const currentDate = new globals.clock.Date()
            this._startTime = currentDate.getTime()
            this.startTimer()
        }

        if (content.length <= 2) {
            this._totalTokens.push(content)
        } else if (content.length > 2) {
            this._totalTokens.push(...content)
        }
    }

    public flush() {
        const terms = this._globals.get<boolean>(ConsolasConstants.termsAcceptedKey) || false
        if (!terms) {
            this._totalTokens = []
            this._acceptedTokens = []
            this.closeTimer()
            return
        }
        this.emitConsolasCodeContribution()
    }

    public emitConsolasCodeContribution() {
        const totalTokens = this._totalTokens
        const acceptedTokens = this._acceptedTokens
        const percentCount = ((acceptedTokens.length / totalTokens.length) * 100).toFixed(2)
        const percentage = Math.round(parseInt(percentCount))
        const date = new globals.clock.Date(this._startTime)
        telemetry.recordConsolasCodePercentage({
            consolasTotalTokens: totalTokens.length ? totalTokens.length : 0,
            consolasStartTime: date.toString(),
            consolasLanguage: this._language,
            consolasAcceptedTokens: acceptedTokens.length ? acceptedTokens.length : 0,
            consolasPercentage: percentage ? percentage : 0,
        })
    }

    public startTimer() {
        if (this._timer !== undefined) {
            return
        }
        this._timer = setTimeout(() => {
            try {
                const currentTime = new globals.clock.Date().getTime()
                const delay: number = ConsolasConstants.defaultCheckPeriodMillis
                const diffTime: number = this._startTime + delay
                if (diffTime <= currentTime) {
                    const totalTokens = this._totalTokens
                    const acceptedTokens = this._acceptedTokens
                    if (totalTokens.length > 0 && acceptedTokens.length > 0) {
                        this.flush()
                    } else {
                        getLogger().debug(`ConsolasCodeCoverageTracker: skipped telemetry due to empty tokens array`)
                    }
                }
            } catch (e) {
                getLogger().verbose(`Exception Thrown from ConsolasCodeCoverageTracker: ${e}`)
            } finally {
                this._totalTokens = []
                this._acceptedTokens = []
                this._startTime = 0
                this.closeTimer()
            }
        }, ConsolasConstants.defaultCheckPeriodMillis)
    }

    public closeTimer() {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    public static readonly instances = new Map<telemetry.ConsolasLanguage, ConsolasCodeCoverageTracker>()
    public static getTracker(
        language: telemetry.ConsolasLanguage = 'plaintext',
        memento: vscode.Memento
    ): ConsolasCodeCoverageTracker {
        const instance = this.instances.get(language) ?? new this(language, memento)
        this.instances.set(language, instance)
        return instance
    }
}
