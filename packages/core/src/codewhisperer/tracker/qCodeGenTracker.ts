/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import * as CodeWhispererConstants from '../models/constants'
import { vsCodeState } from '../models/model'
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
    static copySnippetThreshold = 50

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

    public emitCodeContribution() {
        const selectedCustomization = getSelectedCustomization()
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeCoverageEvent: {
                        customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
                        programmingLanguage: {
                            languageName: 'plaintext',
                        },
                        acceptedCharacterCount: 0,
                        totalCharacterCount: 0,
                        timestamp: new Date(Date.now()),
                        totalNewCodeCharacterCount: this._totalNewCodeCharacterCount,
                        totalNewCodeLineCount: this._totalNewCodeLineCount,
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

    private tryStartTimer() {
        if (this._timer !== undefined) {
            return
        }
        if (!this.isActive()) {
            getLogger().debug(`Skip emiting code contribution metric. Telemetry disabled or not logged in. `)
            this.resetTracker()
            this.closeTimer()
            return
        }
        const startTime = performance.now()
        this._timer = setTimeout(() => {
            try {
                const currentTime = performance.now()
                const delay: number = CodeWhispererConstants.defaultCheckPeriodMillis
                const diffTime: number = startTime + delay
                if (diffTime <= currentTime) {
                    if (this._serviceInvocationCount <= 0) {
                        getLogger().debug(`Skip emiting code contribution metric. There is no active Amazon Q usage. `)
                        return
                    }
                    if (this._totalNewCodeCharacterCount === 0) {
                        getLogger().debug(`Skip emiting code contribution metric. There is no new code added. `)
                        return
                    }
                    this.emitCodeContribution()
                }
            } catch (e) {
                getLogger().verbose(`Exception Thrown from QCodeGenTracker: ${e}`)
            } finally {
                this.resetTracker()
                this.closeTimer()
            }
        }, CodeWhispererConstants.defaultCheckPeriodMillis)
    }

    private resetTracker() {
        this._totalNewCodeLineCount = 0
        this._totalNewCodeCharacterCount = 0
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
        // if user copies code into the editor for more than 50 characters
        // do not count this as total new code, this will skew the data.
        if (contentChange.text.length > QCodeGenTracker.copySnippetThreshold) {
            return
        }
        this._totalNewCodeCharacterCount += contentChange.text.length
        this._totalNewCodeLineCount += contentChange.text.split('\n').length - 1
        // start 5 min data reporting once valid user input is detected
        this.tryStartTimer()
    }
}
