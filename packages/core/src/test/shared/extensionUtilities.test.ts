/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'

import { AWSError } from 'aws-sdk'
import * as path from 'path'
import * as sinon from 'sinon'
import { DefaultEc2MetadataClient } from '../../shared/clients/ec2MetadataClient'
import * as vscode from 'vscode'
import { UserActivity, getComputeRegion, initializeComputeRegion } from '../../shared/extensionUtilities'
import { isDifferentVersion, setMostRecentVersion } from '../../shared/extensionUtilities'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { InstanceIdentity } from '../../shared/clients/ec2MetadataClient'
import { extensionVersion } from '../../shared/vscode/env'
import { sleep } from '../../shared/utilities/timeoutUtils'
import globals from '../../shared/extensionGlobals'
import { createQuickStartWebview, maybeShowMinVscodeWarning } from '../../shared/extensionStartup'
import { fs } from '../../shared'
import { getTestWindow } from './vscode/window'
import { assertTelemetry } from '../testUtil'

describe('extensionUtilities', function () {
    it('maybeShowMinVscodeWarning', async () => {
        const testVscodeVersion = '99.0.0'
        await maybeShowMinVscodeWarning(testVscodeVersion)
        const expectedMsg =
            /will soon require .* 99\.0\.0 or newer. The currently running version .* will no longer receive updates./
        const msg = await getTestWindow().waitForMessage(expectedMsg)
        msg.close()
        assertTelemetry('toolkit_showNotification', [])
    })

    describe('createQuickStartWebview', async function () {
        let context: FakeExtensionContext
        let tempDir: string | undefined

        beforeEach(async function () {
            context = await FakeExtensionContext.create()
            tempDir = await filesystemUtilities.makeTemporaryToolkitFolder()
            context.extensionPath = tempDir
        })

        afterEach(async function () {
            if (tempDir) {
                await fs.delete(tempDir, { recursive: true })
            }
        })

        it("throws error if a quick start page doesn't exist", async () => {
            await assert.rejects(createQuickStartWebview(context, 'irresponsibly-named-file'))
        })

        it('returns a webview with unaltered text if a valid file is passed without tokens', async function () {
            const filetext = 'this temp page does not have any tokens'
            const filepath = 'tokenless'
            await fs.writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createQuickStartWebview(context, filepath)

            assert.strictEqual(typeof webview, 'object')
            const forcedWebview = webview as vscode.WebviewPanel
            assert.strictEqual(forcedWebview.webview.html.includes(filetext), true)
        })

        it('returns a webview with tokens replaced', async function () {
            const token = '!!EXTENSIONROOT!!'
            const basetext = 'this temp page has tokens: '
            const filetext = basetext + token
            const filepath = 'tokenless'
            await fs.writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createQuickStartWebview(context, filepath)

            assert.strictEqual(typeof webview, 'object')
            const forcedWebview = webview as vscode.WebviewPanel

            const pathAsVsCodeResource = forcedWebview.webview.asWebviewUri(vscode.Uri.file(context.extensionPath))
            assert.strictEqual(forcedWebview.webview.html.includes(`${basetext}${pathAsVsCodeResource}`), true)
        })
    })

    describe('isDifferentVersion', function () {
        it('returns false if the version exists and matches the existing version exactly', async function () {
            const goodVersion = '1.2.3'
            await globals.globalState.update('globalsMostRecentVersion', goodVersion)

            assert.strictEqual(isDifferentVersion(goodVersion), false)
        })

        it("returns true if a most recent version isn't set", async () => {
            assert.ok(isDifferentVersion())
        })

        it("returns true if a most recent version doesn't match the current version", async () => {
            const oldVersion = '1.2.3'
            const newVersion = '4.5.6'
            await globals.globalState.update('globalsMostRecentVersion', oldVersion)

            assert.ok(isDifferentVersion(newVersion))
        })
    })

    describe('setMostRecentVersion', function () {
        it('sets the most recent version', async function () {
            setMostRecentVersion()
            assert.strictEqual(globals.globalState.get('globalsMostRecentVersion'), extensionVersion)
        })
    })
})

describe('initializeComputeRegion, getComputeRegion', async function () {
    const metadataService = new DefaultEc2MetadataClient()

    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('throws if the region has not been set', async function () {
        // not quite a pure test: we call activate during the test load so this value will always be set
        // manually hack in the notInitialized value to trigger the error
        sandbox.stub(metadataService, 'getInstanceIdentity').resolves({ region: 'notInitialized' })

        await initializeComputeRegion(metadataService, true)
        assert.throws(getComputeRegion)
    })

    it('returns a compute region', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').resolves({ region: 'us-weast-1' })

        await initializeComputeRegion(metadataService, true)
        assert.strictEqual(getComputeRegion(), 'us-weast-1')
    })

    it('returns a compute region for sagemaker', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').resolves({ region: 'us-weast-1' })

        await initializeComputeRegion(metadataService, false, true)
        assert.strictEqual(getComputeRegion(), 'us-weast-1')
    })

    it('returns "unknown" if cloud9 and the MetadataService request fails', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').rejects({} as AWSError)

        await initializeComputeRegion(metadataService, true)
        assert.strictEqual(getComputeRegion(), 'unknown')
    })

    it('returns "unknown" if sagemaker and the MetadataService request fails', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').rejects({} as AWSError)

        await initializeComputeRegion(metadataService, false, true)
        assert.strictEqual(getComputeRegion(), 'unknown')
    })

    it('returns "unknown" if cloud9 and can not find a region', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').resolves({} as InstanceIdentity)

        await initializeComputeRegion(metadataService, true)
        assert.strictEqual(getComputeRegion(), 'unknown')
    })

    it('returns "unknown" if sagemaker and can not find a region', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').resolves({} as InstanceIdentity)

        await initializeComputeRegion(metadataService, false, true)
        assert.strictEqual(getComputeRegion(), 'unknown')
    })

    it('returns undefined if not cloud9 or sagemaker', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').callsArgWith(1, undefined, 'lol')

        await initializeComputeRegion(metadataService, false, false)
        assert.strictEqual(getComputeRegion(), undefined)
    })

    it('handles invalid endpoint or invalid response', async function () {
        await assert.rejects(metadataService.invoke('/bogus/path'))
    })
})

describe('UserActivity', function () {
    let count: number
    let sandbox: sinon.SinonSandbox

    function onEventTriggered() {
        count++
    }

    before(function () {
        count = 0
        sandbox = sinon.createSandbox()
    })

    it('triggers twice when multiple user activities are fired in separate intervals', async function () {
        const throttleDelay = 500

        const firstInvervalMillisUntilFire = [100, 101, 102, 103]

        const secondIntervalStart = firstInvervalMillisUntilFire[0] + throttleDelay + 1
        const secondIntervalMillisUntilFire = [
            secondIntervalStart + 200,
            secondIntervalStart + 201,
            secondIntervalStart + 201,
            secondIntervalStart + 202,
        ]
        const instance = new UserActivity(throttleDelay, [
            ...firstInvervalMillisUntilFire.map(delayedTriggeredEvent),
            ...secondIntervalMillisUntilFire.map(delayedTriggeredEvent),
        ])
        instance.onUserActivity(onEventTriggered)
        await sleep(secondIntervalStart + throttleDelay + 1)

        assert.strictEqual(count, 2, 'May be flaky in CI, increase timings to improve reliability.')
    })

    describe('does not fire user activity events in specific scenarios', function () {
        let userActivitySubscriber: sinon.SinonStubbedMember<() => void>
        let _triggerUserActivity: (obj: any) => void
        let instance: UserActivity

        beforeEach(function () {
            userActivitySubscriber = sandbox.stub()
            _triggerUserActivity = () => {
                throw Error('Called before UserActivity was instantiated')
            }
        })

        afterEach(function () {
            instance.dispose()
            sandbox.restore()
        })

        it('does not fire onDidChangeWindowState when not active', function () {
            stubUserActivityEvent(vscode.window, 'onDidChangeWindowState')

            const triggerUserActivity = createTriggerActivityFunc()

            triggerUserActivity({ active: false })
            assert.strictEqual(userActivitySubscriber.callCount, 0)

            triggerUserActivity({ active: true })
            assert.strictEqual(userActivitySubscriber.callCount, 1)
        })

        it('does not fire onDidChangeTextEditorSelection when editor is `Output` panel', function () {
            stubUserActivityEvent(vscode.window, 'onDidChangeTextEditorSelection')

            const triggerUserActivity = createTriggerActivityFunc()

            triggerUserActivity({ textEditor: { document: { uri: { scheme: 'output' } } } })
            assert.strictEqual(userActivitySubscriber.callCount, 0)

            triggerUserActivity({ textEditor: { document: { uri: { scheme: 'NOToutput' } } } })
            assert.strictEqual(userActivitySubscriber.callCount, 1)
        })

        it('does not fire onDidChangeTextEditorVisibleRanges when when editor is `Output` panel', function () {
            stubUserActivityEvent(vscode.window, 'onDidChangeTextEditorVisibleRanges')

            const triggerUserActivity = createTriggerActivityFunc()

            triggerUserActivity({ textEditor: { document: { uri: { scheme: 'output' } } } })
            assert.strictEqual(userActivitySubscriber.callCount, 0)

            triggerUserActivity({ textEditor: { document: { uri: { scheme: 'NOToutput' } } } })
            assert.strictEqual(userActivitySubscriber.callCount, 1)
        })

        it('does not fire onDidChangeTextDocument when not the active user document', function () {
            stubUserActivityEvent(vscode.workspace, 'onDidChangeTextDocument')
            const activeEditorStub = sandbox.stub(vscode.window, 'activeTextEditor')

            const triggerUserActivity = createTriggerActivityFunc()

            activeEditorStub.get(() => undefined)
            triggerUserActivity({})
            assert.strictEqual(userActivitySubscriber.callCount, 0, 'Was not ignored when no active editor')

            activeEditorStub.get(() => {
                return { document: { uri: 'myUri' } }
            })
            triggerUserActivity({ document: { uri: 'myOtherUri' } })
            assert.strictEqual(
                userActivitySubscriber.callCount,
                0,
                'Was not ignored when active editor document was different from the event'
            )

            triggerUserActivity({ document: { uri: 'myUri' } })
            assert.strictEqual(
                userActivitySubscriber.callCount,
                1,
                'Was ignored when the active editor document was the same as the event'
            )
        })

        it('fires for onDidChangeActiveColorTheme (sanity check)', function () {
            stubUserActivityEvent(vscode.window, 'onDidChangeActiveColorTheme')

            const triggerUserActivity = createTriggerActivityFunc()

            triggerUserActivity({})
            assert.strictEqual(userActivitySubscriber.callCount, 1)
        })

        /**
         * Helper to stub a vscode event object.
         *
         * Once stubbed, you can call {@link _triggerUserActivity} to fire
         * the event.
         */
        function stubUserActivityEvent<T, K extends keyof T>(vscodeObj: T, eventName: K) {
            const eventStub = sandbox.stub(vscodeObj, eventName)

            eventStub.callsFake((callback: any) => {
                _triggerUserActivity = callback
                return {
                    dispose: sandbox.stub(),
                }
            })

            return eventStub
        }

        function createTriggerActivityFunc() {
            instance = new UserActivity(0)
            instance.onUserActivity(userActivitySubscriber)
            // Creation of the UserActivity instance will call the stubbed event and set the value
            // for _triggerUserActivity.
            return _triggerUserActivity
        }
    })

    function delayedTriggeredEvent(millisUntilFire: number): vscode.Event<any> {
        const event = new vscode.EventEmitter<void>()
        globals.clock.setTimeout(() => event.fire(), millisUntilFire)
        return event.event
    }
})
