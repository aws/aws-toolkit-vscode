/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { anyString, spy } from '../../utilities/mockito'
import { codeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import CodeWhispererUserClient, {
    SendTelemetryEventResponse,
    TelemetryEvent,
} from '../../../codewhisperer/client/codewhispereruserclient'
import globals from '../../../shared/extensionGlobals'
import { AWSError, Request } from 'aws-sdk'

describe('codewhisperer', async function () {
    let clientSpy: CodeWhispererUserClient
    let telemetryEnabledDefault: boolean

    beforeEach(async function () {
        sinon.restore()
        clientSpy = spy(await codeWhispererClient.createUserSdkClient())
        sinon.stub(codeWhispererClient, 'createUserSdkClient').returns(Promise.resolve(clientSpy))
        telemetryEnabledDefault = globals.telemetry.telemetryEnabled
    })

    afterEach(function () {
        sinon.restore()
        globals.telemetry.telemetryEnabled = telemetryEnabledDefault
    })

    it('sendTelemetryEvent for userTriggerDecision should respect telemetry optout status', async function () {
        await sendTelemetryEventOptoutCheckHelper({
            userTriggerDecisionEvent: {
                sessionId: anyString(),
                requestId: anyString(),
                programmingLanguage: { languageName: 'python' },
                completionType: 'BLOCK',
                suggestionState: 'ACCEPT',
                recommendationLatencyMilliseconds: 1,
                timestamp: new Date(),
            },
        })
    })

    it('sendTelemetryEvent for codeScan should respect telemetry optout status', async function () {
        await sendTelemetryEventOptoutCheckHelper({
            codeScanEvent: {
                programmingLanguage: { languageName: 'python' },
                codeScanJobId: anyString(),
                timestamp: new Date(),
            },
        })
    })

    it('sendTelemetryEvent for codePercentage should respect telemetry optout status', async function () {
        await sendTelemetryEventOptoutCheckHelper({
            codeCoverageEvent: {
                programmingLanguage: { languageName: 'python' },
                acceptedCharacterCount: 0,
                totalCharacterCount: 1,
                timestamp: new Date(),
            },
        })
    })

    it('sendTelemetryEvent for userModification should respect telemetry optout status', async function () {
        await sendTelemetryEventOptoutCheckHelper({
            userModificationEvent: {
                sessionId: anyString(),
                requestId: anyString(),
                programmingLanguage: { languageName: 'python' },
                modificationPercentage: 2.0,
                timestamp: new Date(),
            },
        })
    })

    async function sendTelemetryEventOptoutCheckHelper(payload: TelemetryEvent) {
        const stub = sinon.stub(clientSpy, 'sendTelemetryEvent').returns({
            promise: () =>
                Promise.resolve({
                    $response: {
                        requestId: anyString(),
                    },
                }),
        } as Request<SendTelemetryEventResponse, AWSError>)

        globals.telemetry.telemetryEnabled = true
        await codeWhispererClient.sendTelemetryEvent({ telemetryEvent: payload })
        sinon.assert.calledWith(stub, sinon.match({ optOutPreference: 'OPTIN' }))

        globals.telemetry.telemetryEnabled = false
        await codeWhispererClient.sendTelemetryEvent({ telemetryEvent: payload })
        sinon.assert.calledWith(stub, sinon.match({ optOutPreference: 'OPTOUT' }))
    }
})
