/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import * as CodeWhispererConstants from '../models/constants'
import { OnRecommendationAcceptanceEntry, vsCodeState } from '../models/model'
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
    private _qUsageCount: number

    static #instance: QCodeGenTracker
    static copySnippetThreshold = 50

    private constructor() {
        this._totalNewCodeLineCount = 0
        this._totalNewCodeCharacterCount = 0
        this._qUsageCount = 0
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public isActive(): boolean {
        return TelemetryHelper.instance.isTelemetryEnabled() && AuthUtil.instance.isConnected()
    }

    // this should be invoked whenever there is a successful Q feature invocation
    // for all Q features
    public onQFeatureInvoked() {
        this._qUsageCount += 1
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
                    if (this._qUsageCount <= 0) {
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
        this._qUsageCount = 0
    }

    private closeTimer() {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    private countNewLines(str: string) {
        return str.split('\n').length - 1
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
        this._totalNewCodeLineCount += this.countNewLines(contentChange.text)
        // start 5 min data reporting once valid user input is detected
        this.tryStartTimer()
    }

    // add Q inline completion contributed code to total code written
    public onInlineCompletionAcceptance(acceptanceEntry: OnRecommendationAcceptanceEntry) {
        let typeaheadLength = 0
        if (acceptanceEntry.editor) {
            typeaheadLength = acceptanceEntry.editor.document.getText(acceptanceEntry.range).length
        }
        const documentChangeLength = acceptanceEntry.recommendation.length - typeaheadLength
        // if the inline completion is less than 50 characters, it will be auto captured by onTextDocumentChange
        // notice that the document change event of such acceptance do not include typeahead
        if (documentChangeLength <= QCodeGenTracker.copySnippetThreshold) {
            return
        }
        this._totalNewCodeCharacterCount += acceptanceEntry.recommendation.length
        this._totalNewCodeLineCount += this.countNewLines(acceptanceEntry.recommendation)
    }

    // add Q chat insert to cursor code to total code written
    public onQChatInsertion(acceptedCharacterCount?: number, acceptedLineCount?: number) {
        if (acceptedCharacterCount && acceptedLineCount) {
            // if the chat inserted code is less than 50 characters, it will be auto captured by onTextDocumentChange
            if (acceptedCharacterCount <= QCodeGenTracker.copySnippetThreshold) {
                return
            }
            this._totalNewCodeCharacterCount += acceptedCharacterCount
            this._totalNewCodeLineCount += acceptedLineCount
        }
    }

    // add Q inline chat acceptance to total code written
    public onInlineChatAcceptance() {}

    // TODO: add Q inline chat acceptance to total code written
    public onTransformAcceptance() {}

    // TODO: add Q feature dev acceptance to total code written
    public onFeatureDevAcceptance() {}

    // TODO: add Q UTG acceptance to total code written
    public onUtgAcceptance() {}

    // TODO: add Q UTG acceptance to total code written
    public onDocAcceptance() {}
}
