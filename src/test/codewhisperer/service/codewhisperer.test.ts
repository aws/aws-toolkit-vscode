/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { codeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import CodeWhispererUserClient, {
    SendTelemetryEventResponse,
    TelemetryEvent,
} from '../../../codewhisperer/client/codewhispereruserclient'
import globals from '../../../shared/extensionGlobals'
import { AWSError, Request } from 'aws-sdk'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { createSpyClient } from '../testUtil'
import * as os from 'os'
import { getClientId } from '../../../shared/telemetry/util'

describe('codewhisperer', async function () {
    let clientSpy: CodeWhispererUserClient
    let telemetryEnabledDefault: boolean
    const userTriggerDecisionPayload: TelemetryEvent = {
        userTriggerDecisionEvent: {
            sessionId: '',
            requestId: '',
            programmingLanguage: { languageName: 'python' },
            completionType: 'BLOCK',
            suggestionState: 'ACCEPT',
            recommendationLatencyMilliseconds: 1,
            timestamp: new Date(),
        },
    }

    beforeEach(async function () {
        sinon.restore()
        clientSpy = await createSpyClient()
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
                codeScanJobId: '',
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
                sessionId: '',
                requestId: '',
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

    it('sendTelemetryEvent should be called with UserContext payload', async function () {
        const clientSpyStub = sinon.stub(clientSpy, 'sendTelemetryEvent').returns({
            promise: () =>
                Promise.resolve({
                    $response: {
                        requestId: '',
                    },
                }),
        } as Request<SendTelemetryEventResponse, AWSError>)

        const expectedUserContext = {
            ideCategory: 'VSCODE',
            operatingSystem: getOperatingSystem(),
            product: 'CodeWhisperer',
            clientId: await getClientId(globals.context.globalState),
        }

        await codeWhispererClient.sendTelemetryEvent({ telemetryEvent: userTriggerDecisionPayload })
        sinon.assert.calledWith(clientSpyStub, sinon.match({ userContext: expectedUserContext }))
    })

    function getOperatingSystem(): string {
        const osId = os.platform() // 'darwin', 'win32', 'linux', etc.
        if (osId === 'darwin') {
            return 'MAC'
        } else if (osId === 'win32') {
            return 'WINDOWS'
        } else {
            return 'LINUX'
        }
    }

    async function sendTelemetryEventOptoutCheckHelper(
        payload: TelemetryEvent,
        isSso: boolean,
        isTelemetryEnabled: boolean
    ) {
        const clientSpyStub = sinon.stub(clientSpy, 'sendTelemetryEvent').returns({
            promise: () =>
                Promise.resolve({
                    $response: {
                        requestId: '',
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
