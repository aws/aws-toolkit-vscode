/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { SinonStub, SinonStubbedInstance, SinonStubbedMember, createSandbox, createStubInstance } from 'sinon'
import assert from 'assert'
import * as vscode from 'vscode'

import { ExtensionUserActivity } from '../../../shared/extensionUtilities'
import { DevEnvClient, DevEnvActivity } from '../../../shared/clients/devenvClient'
import { sleep } from '../../../shared/utilities/timeoutUtils'

describe('DevEnvActivity', function () {
    let triggerUserActivityEvent: (obj: any) => Promise<void>
    let userActivityEvent: SinonStub<Parameters<vscode.Event<any>>, vscode.Disposable>
    let activitySubscriber: SinonStubbedMember<(timestamp: number) => void>
    let devEnvClientStub: SinonStubbedInstance<DevEnvClient>
    let devEnvActivity: DevEnvActivity
    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = createSandbox()
    })

    beforeEach(async function () {
        userActivityEvent = sandbox.stub(vscode.window, 'onDidChangeActiveColorTheme')
        userActivityEvent.callsFake((throttledEventFire: (obj: any) => void) => {
            triggerUserActivityEvent = async (obj: any) => {
                throttledEventFire(obj)
                // There are multiple layers of emitters firing
                // so we wait a bit before returning. Otherwise,
                // racecondition when waiting for activitySubscriber
                // to be called
                await sleep(100)
            }
            return {
                dispose: sandbox.stub(),
            }
        })

        devEnvClientStub = createStubInstance(DevEnvClient)

        devEnvActivity = (await DevEnvActivity.instanceIfActivityTrackingEnabled(
            devEnvClientStub as unknown as DevEnvClient,
            new ExtensionUserActivity(0, [userActivityEvent])
        ))!
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('has expected throttle delay that we send updates on user activity', function () {
        assert.strictEqual(DevEnvActivity.activityUpdateDelay, 10_000)
    })

    it('does not allow instance to be created if activity API not working', async function () {
        devEnvClientStub.getActivity.throws()
        const instance = await DevEnvActivity.instanceIfActivityTrackingEnabled(
            devEnvClientStub as unknown as DevEnvClient,
            new ExtensionUserActivity(0, [userActivityEvent])
        )
        assert.strictEqual(instance, undefined)
    })

    describe('activity subscribers are properly notified', function () {
        beforeEach(function () {
            activitySubscriber = sandbox.stub()
            devEnvActivity.onActivityUpdate(activitySubscriber)
        })

        it('when user activity is explicitly updated', async () => {
            assert.strictEqual(activitySubscriber.callCount, 0)
            await devEnvActivity.sendActivityUpdate()
            assert.strictEqual(activitySubscriber.callCount, 1)
        })

        it('when vscode user activity event is emitted', async () => {
            assert.strictEqual(activitySubscriber.callCount, 0)
            await triggerUserActivityEvent({})
            assert.strictEqual(activitySubscriber.callCount, 1)
        })

        it('when we discover a different activity timestamp on the server', async () => {
            assert.strictEqual(activitySubscriber.callCount, 0)

            await devEnvActivity.sendActivityUpdate(111) // We send an activity update
            assert.strictEqual(activitySubscriber.callCount, 1)

            devEnvClientStub.getActivity.resolves(222) // If we retrieve the latest activity timestamp it will be different
            await devEnvActivity.getLatestActivity()
            assert.strictEqual(activitySubscriber.callCount, 2)
        })
    })
})
