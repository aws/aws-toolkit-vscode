/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from '../../common/crypto'

export interface ICodeTransformMetaData {
    dependencyVersionSelected?: string
    canceledFromChat?: boolean
    retryCount?: number
    errorMessage?: string
}

interface ICodeTransformerTelemetryState {
    sessionId: string
    sessionStartTime: number
    resultStatus: string
    codeTransformMetadata: ICodeTransformMetaData
}

class CodeTransformerTelemetryState {
    private static instance: CodeTransformerTelemetryState
    mainState: ICodeTransformerTelemetryState

    private constructor() {
        this.mainState = {
            sessionId: randomUUID(),
            sessionStartTime: Date.now(),
            resultStatus: '',
            codeTransformMetadata: {},
        }
    }

    public static getInstance(): CodeTransformerTelemetryState {
        if (!CodeTransformerTelemetryState.instance) {
            CodeTransformerTelemetryState.instance = new CodeTransformerTelemetryState()
        }

        return CodeTransformerTelemetryState.instance
    }

    public getSessionId = () => this.mainState.sessionId
    public getStartTime = () => this.mainState.sessionStartTime
    public getResultStatus = () => this.mainState.resultStatus
    public getCodeTransformMetaData = () => this.mainState.codeTransformMetadata
    public getCodeTransformMetaDataString = () => JSON.stringify(this.mainState.codeTransformMetadata)

    public setSessionId = () => {
        this.mainState.sessionId = randomUUID()
    }
    public setStartTime = () => {
        this.mainState.sessionStartTime = Date.now()
    }
    public setResultStatus = (newValue: string) => {
        this.mainState.resultStatus = newValue
    }
    public setCodeTransformMetaDataField = (updatePartial: Partial<ICodeTransformMetaData>) => {
        this.mainState.codeTransformMetadata = {
            ...this.mainState.codeTransformMetadata,
            ...updatePartial,
        }
    }
    public resetCodeTransformMetaDataField = () => (this.mainState.codeTransformMetadata = {})
}

export const codeTransformTelemetryState = CodeTransformerTelemetryState.getInstance()
