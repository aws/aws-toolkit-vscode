/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { ExtensionContext } from 'vscode'
import { handleTelemetryOptIn } from '../../../awsService/cloudformation/telemetryOptIn'
import { CloudFormationTelemetrySettings } from '../../../awsService/cloudformation/extensionConfig'
import { commandKey } from '../../../awsService/cloudformation/utils'

describe('telemetryOptIn', function () {
    let mockContext: ExtensionContext
    let mockSettings: CloudFormationTelemetrySettings
    let globalState: Map<string, any>

    beforeEach(function () {
        globalState = new Map()

        mockContext = {
            globalState: {
                get: (key: string, defaultValue?: any) => globalState.get(key) ?? defaultValue,
                update: async (key: string, value: any) => {
                    globalState.set(key, value)
                },
            },
        } as any

        mockSettings = {
            get: sinon.stub().returns(false),
            update: sinon.stub().resolves(),
        } as any
    })

    describe('promptTelemetryOptIn - automation mode', function () {
        it('should return current setting without prompting in automation mode', async function () {
            sinon.stub(require('../../../shared/vscode/env'), 'isAutomation').returns(true)
            ;(mockSettings.get as sinon.SinonStub).returns(true)

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, true)
        })
    })

    describe('promptTelemetryOptIn - user has responded', function () {
        it('should return current setting if user has permanently responded', async function () {
            globalState.set(commandKey('telemetry.hasResponded'), true)
            ;(mockSettings.get as sinon.SinonStub).returns(true)

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, true)
        })
    })

    describe('promptTelemetryOptIn - prompt timing', function () {
        it('should not prompt if less than 30 days since last prompt', async function () {
            const now = Date.now()
            const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000
            globalState.set(commandKey('telemetry.lastPromptDate'), twentyDaysAgo)

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, false)
        })
    })

    describe('promptTelemetryOptIn - unpersisted response', function () {
        it('should persist unpersisted Allow response', async function () {
            globalState.set(commandKey('telemetry.unpersistedResponse'), 'Yes, Allow')

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, true)
            assert.ok((mockSettings.update as sinon.SinonStub).calledWith('enabled', true))
            assert.strictEqual(globalState.get(commandKey('telemetry.unpersistedResponse')), undefined)
        })

        it('should persist unpersisted Never response', async function () {
            globalState.set(commandKey('telemetry.unpersistedResponse'), 'Never')
            ;(mockSettings.update as sinon.SinonStub).resolves(true)

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, false)
            assert.ok((mockSettings.update as sinon.SinonStub).calledWith('enabled', false))
            assert.strictEqual(globalState.get(commandKey('telemetry.unpersistedResponse')), undefined)
        })

        it('should persist unpersisted Later response', async function () {
            const lastPromptDate = Date.now() - 1000
            globalState.set(commandKey('telemetry.unpersistedResponse'), 'Not Now')
            globalState.set(commandKey('telemetry.lastPromptDate'), lastPromptDate)
            ;(mockSettings.update as sinon.SinonStub).resolves(true)

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, false)
            assert.ok((mockSettings.update as sinon.SinonStub).calledWith('enabled', false))
            assert.strictEqual(globalState.get(commandKey('telemetry.lastPromptDate')), lastPromptDate)
            assert.strictEqual(globalState.get(commandKey('telemetry.unpersistedResponse')), undefined)
        })

        it('should clear all state if setting save fails', async function () {
            globalState.set(commandKey('telemetry.unpersistedResponse'), 'Yes, Allow')
            globalState.set(commandKey('telemetry.hasResponded'), true)
            globalState.set(commandKey('telemetry.lastPromptDate'), Date.now())
            ;(mockSettings.update as sinon.SinonStub).resolves(false)

            const result = await handleTelemetryOptIn(mockContext, mockSettings)

            assert.strictEqual(result, true)
            assert.strictEqual(globalState.get(commandKey('telemetry.unpersistedResponse')), undefined)
            assert.strictEqual(globalState.get(commandKey('telemetry.hasResponded')), undefined)
            assert.strictEqual(globalState.get(commandKey('telemetry.lastPromptDate')), undefined)
        })
    })
})
