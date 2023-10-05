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
import { AWSError, Request, Service } from 'aws-sdk'
import { DefaultAWSClientBuilder, ServiceOptions } from '../../../shared/awsClientBuilder'
import { FakeAwsContext } from '../../utilities/fakeAwsContext'
import userApiConfig = require('./../../../codewhisperer/client/user-service-2.json')
import { AuthUtil } from '../../../codewhisperer/util/authUtil'

describe('codewhisperer', async function () {
    let clientSpy: CodeWhispererUserClient
    let telemetryEnabledDefault: boolean

    beforeEach(async function () {
        sinon.restore()
        const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
        clientSpy = spy(
            (await builder.createAwsService(Service, {
                apiConfig: userApiConfig,
            } as ServiceOptions)) as CodeWhispererUserClient
        )
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

        sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(true)
        globals.telemetry.telemetryEnabled = true
        await codeWhispererClient.sendTelemetryEvent({ telemetryEvent: payload })
        sinon.assert.calledWith(stub, sinon.match({ optOutPreference: 'OPTIN' }))

        globals.telemetry.telemetryEnabled = false
        await codeWhispererClient.sendTelemetryEvent({ telemetryEvent: payload })
        sinon.assert.calledWith(stub, sinon.match({ optOutPreference: 'OPTOUT' }))
    }
})
