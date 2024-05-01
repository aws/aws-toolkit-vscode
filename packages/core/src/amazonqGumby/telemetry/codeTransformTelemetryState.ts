/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from '../../common/crypto'

interface ICodeTransformTelemetryState {
    sessionId: string
    sessionStartTime: number
    resultStatus: string
}

export class CodeTransformTelemetryState {
    mainState: ICodeTransformTelemetryState

    private constructor() {
        this.mainState = {
            sessionId: randomUUID(),
            sessionStartTime: Date.now(),
            resultStatus: '',
        }
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

    static #instance: CodeTransformTelemetryState

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
