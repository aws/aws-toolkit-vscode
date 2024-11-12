/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import * as CodeWhispererConstants from '../models/constants'
import globals from '../../shared/extensionGlobals'
import { vsCodeState } from '../models/model'
import { CodewhispererLanguage, telemetry } from '../../shared/telemetry/telemetry'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import { AuthUtil } from '../util/authUtil'
import { getSelectedCustomization } from '../util/customizationUtil'
import { codeWhispererClient as client } from '../client/codewhisperer'
import { isAwsError } from '../../shared/errors'

/**
 * This singleton class is mainly used for calculating the total code written by Amazon Q and user
 * It is meant to replace `CodeWhispererCodeCoverageTracker`
 */
export class QCodeGenTracker {
    private _totalNewCodeCharacterCount: number
    private _totalNewCodeLineCount: number
    private _timer?: NodeJS.Timer
    private _serviceInvocationCount: number

    static #instance: QCodeGenTracker

    private constructor() {
        this._totalNewCodeLineCount = 0
        this._totalNewCodeCharacterCount = 0
        this._serviceInvocationCount = 0
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public get serviceInvocationCount(): number {
        return this._serviceInvocationCount
    }

    public isActive(): boolean {
        return TelemetryHelper.instance.isTelemetryEnabled() && AuthUtil.instance.isConnected()
    }

    public onQFeatureInvoked() {
        this._serviceInvocationCount += 1
    }

    public flush() {
        if (!this.isActive()) {
            this._totalNewCodeLineCount = 0
            this._totalNewCodeCharacterCount = 0
            this.closeTimer()
            return
        }
        try {
            this.emitCodeContribution()
        } catch (error) {
            getLogger().error(`Encountered ${error} when emitting code contribution metric`)
        }
    }

    public emitCodeContribution() {
        const selectedCustomization = getSelectedCustomization()
        if (this._serviceInvocationCount <= 0) {
            getLogger().debug(`Skip emiting code contribution metric. There is no Amazon Q active usage. `)
            return
        }
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeCoverageEvent: {
                        customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(this._language),
                        },
                        acceptedCharacterCount: 0,
                        totalCharacterCount: 0,
                        timestamp: new Date(Date.now()),
                        totalNewCodeCharacterCount: 0,
                        totalNewCodeLineCount: 0,
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
        const startTime = performance.now()
        this._timer = setTimeout(() => {
            try {
                const currentTime = new globals.clock.Date().getTime()
                const delay: number = CodeWhispererConstants.defaultCheckPeriodMillis
                const diffTime: number = startTime + delay
                if (diffTime <= currentTime) {
                    if (this._totalNewCodeCharacterCount > 0) {
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

    public onTextDocumentChange(e: vscode.TextDocumentChangeEvent) {
        if (
            !runtimeLanguageContext.isLanguageSupported(e.document.languageId) ||
            vsCodeState.isCodeWhispererEditing ||
            e.contentChanges.length === 0
        ) {
            return
        }
        const contentChange = e.contentChanges[0]
        if (contentChange.text.length > 50) {
            return
        }
        this._totalNewCodeCharacterCount += contentChange.text.length
        // start 5 min data reporting once valid user input is detected
        this.tryStartTimer()
    }
}
