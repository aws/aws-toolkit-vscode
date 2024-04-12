/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from '../../common/crypto'

interface ICodeTransformerTelemetryState {
    sessionId: string
    sessionStartTime: number
    resultStatus: string
}

class CodeTransformerTelemetryState {
    private static instance: CodeTransformerTelemetryState
    mainState: ICodeTransformerTelemetryState

    private constructor() {
        this.mainState = {
            sessionId: randomUUID(),
            sessionStartTime: Date.now(),
            resultStatus: '',
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

    public setSessionId = () => {
        this.mainState.sessionId = randomUUID()
    }
    public setStartTime = () => {
        this.mainState.sessionStartTime = Date.now()
    }
    public setResultStatus = (newValue: string) => {
        this.mainState.resultStatus = newValue
    }
}

export const codeTransformTelemetryState = CodeTransformerTelemetryState.getInstance()
