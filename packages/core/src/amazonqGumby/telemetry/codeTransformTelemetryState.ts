/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from '../../common/crypto'

interface ICodeTransformTelemetryState {
    sessionId: string
    sessionStartTime: number
}

export class CodeTransformTelemetryState {
    mainState: ICodeTransformTelemetryState

    private constructor() {
        this.mainState = {
            sessionId: randomUUID(),
            sessionStartTime: Date.now(),
        }
    }

    public getSessionId = () => this.mainState.sessionId
    public getStartTime = () => this.mainState.sessionStartTime

    public setSessionId = () => {
        this.mainState.sessionId = randomUUID()
    }
    public setStartTime = () => {
        this.mainState.sessionStartTime = Date.now()
    }

    static #instance: CodeTransformTelemetryState

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
