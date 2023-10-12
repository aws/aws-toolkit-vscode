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
    const userTriggerDecisionPayload: TelemetryEvent = {
        userTriggerDecisionEvent: {
            sessionId: anyString(),
            requestId: anyString(),
            programmingLanguage: { languageName: 'python' },
            completionType: 'BLOCK',
            suggestionState: 'ACCEPT',
            recommendationLatencyMilliseconds: 1,
            timestamp: new Date(),
        },
    }

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
        await sendTelemetryEventOptoutCheckHelper(userTriggerDecisionPayload, true, true)
        await sendTelemetryEventOptoutCheckHelper(userTriggerDecisionPayload, true, false)
    })

    it('sendTelemetryEvent for codeScan should respect telemetry optout status', async function () {
        const payload = {
            codeScanEvent: {
                programmingLanguage: { languageName: 'python' },
                codeScanJobId: anyString(),
                timestamp: new Date(),
            },
        }
        await sendTelemetryEventOptoutCheckHelper(payload, true, true)
        await sendTelemetryEventOptoutCheckHelper(payload, true, false)
    })

    it('sendTelemetryEvent for codePercentage should respect telemetry optout status', async function () {
        const payload = {
            codeCoverageEvent: {
                programmingLanguage: { languageName: 'python' },
                acceptedCharacterCount: 0,
                totalCharacterCount: 1,
                timestamp: new Date(),
            },
        }
        await sendTelemetryEventOptoutCheckHelper(payload, true, true)
        await sendTelemetryEventOptoutCheckHelper(payload, true, false)
    })

    it('sendTelemetryEvent for userModification should respect telemetry optout status', async function () {
        const payload = {
            userModificationEvent: {
                sessionId: anyString(),
                requestId: anyString(),
                programmingLanguage: { languageName: 'python' },
                modificationPercentage: 2.0,
                timestamp: new Date(),
            },
        }
        await sendTelemetryEventOptoutCheckHelper(payload, true, true)
        await sendTelemetryEventOptoutCheckHelper(payload, true, false)
    })

    it('sendTelemetryEvent should be called for SSO user who optin telemetry', async function () {
        await sendTelemetryEventOptoutCheckHelper(userTriggerDecisionPayload, true, true)
    })

    it('sendTelemetryEvent should be called for SSO user who optout telemetry', async function () {
        await sendTelemetryEventOptoutCheckHelper(userTriggerDecisionPayload, true, false)
    })

    it('sendTelemetryEvent should be called for Builder ID user who optin telemetry', async function () {
        await sendTelemetryEventOptoutCheckHelper(userTriggerDecisionPayload, false, true)
    })

    it('sendTelemetryEvent should NOT be called for Builder ID user who optout telemetry', async function () {
        await sendTelemetryEventOptoutCheckHelper(userTriggerDecisionPayload, false, false)
    })

    async function sendTelemetryEventOptoutCheckHelper(
        payload: TelemetryEvent,
        isSso: boolean,
        isTelemetryEnabled: boolean
    ) {
        const clientSpyStub = sinon.stub(clientSpy, 'sendTelemetryEvent').returns({
            promise: () =>
                Promise.resolve({
                    $response: {
                        requestId: anyString(),
                    },
                }),
        } as Request<SendTelemetryEventResponse, AWSError>)

        const authUtilStub = sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(isSso)
        globals.telemetry.telemetryEnabled = isTelemetryEnabled
        await codeWhispererClient.sendTelemetryEvent({ telemetryEvent: payload })
        const expectedOptOutPreference = isTelemetryEnabled ? 'OPTIN' : 'OPTOUT'
        if (isSso || isTelemetryEnabled) {
            sinon.assert.calledWith(clientSpyStub, sinon.match({ optOutPreference: expectedOptOutPreference }))
        } else {
            sinon.assert.notCalled(clientSpyStub)
        }
        clientSpyStub.restore()
        authUtilStub.restore()
    }
})
