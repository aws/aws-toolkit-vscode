/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from '../../shared/crypto'
import { codeTransformMetaDataToJsonString, ICodeTransformMetaData } from './codeTransformMetadata'
import globals from '../../shared/extensionGlobals'

interface ICodeTransformTelemetryState {
    sessionId: string
    sessionStartTime: number
    resultStatus: string
    codeTransformMetadata: ICodeTransformMetaData
}

export class CodeTransformTelemetryState {
    mainState: ICodeTransformTelemetryState

    private constructor() {
        this.mainState = {
            sessionId: randomUUID(),
            sessionStartTime: globals.clock.Date.now(),
            resultStatus: '',
            codeTransformMetadata: {},
        }
    }

    public getSessionId = () => this.mainState.sessionId
    public getStartTime = () => this.mainState.sessionStartTime
    public getResultStatus = () => this.mainState.resultStatus
    public getCodeTransformMetaData = () => this.mainState.codeTransformMetadata
    public getCodeTransformMetaDataString = () =>
        codeTransformMetaDataToJsonString(this.mainState.codeTransformMetadata)

    public setSessionId = () => {
        this.mainState.sessionId = randomUUID()
    }
    public setStartTime = () => {
        this.mainState.sessionStartTime = globals.clock.Date.now()
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

    static #instance: CodeTransformTelemetryState

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
