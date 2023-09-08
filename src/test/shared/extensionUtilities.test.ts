/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

import { AWSError } from 'aws-sdk'
import { writeFile, remove } from 'fs-extra'
import * as path from 'path'
import * as sinon from 'sinon'
import { DefaultEc2MetadataClient } from '../../shared/clients/ec2MetadataClient'
import * as vscode from 'vscode'
import {
    ExtensionUserActivity,
    getComputeRegion,
    initializeComputeRegion,
    mostRecentVersionKey,
} from '../../shared/extensionUtilities'
import {
    createQuickStartWebview,
    isDifferentVersion,
    safeGet,
    setMostRecentVersion,
} from '../../shared/extensionUtilities'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { InstanceIdentity } from '../../shared/clients/ec2MetadataClient'
import { extensionVersion } from '../../shared/vscode/env'
import { sleep } from '../../shared/utilities/timeoutUtils'

describe('extensionUtilities', function () {
    describe('safeGet', function () {
        class Blah {
            public someProp?: string

            public constructor(someProp?: string) {
                this.someProp = someProp
            }
        }

        it('can access sub-property', function () {
            assert.strictEqual(
                safeGet(new Blah('hello!'), x => x.someProp),
                'hello!'
            )
            assert.strictEqual(
                safeGet(new Blah(), x => x.someProp),
                undefined
            )
            assert.strictEqual(
                safeGet(undefined as Blah | undefined, x => x.someProp),
                undefined
            )
        })
    })

    describe('createQuickStartWebview', async function () {
        const context = await FakeExtensionContext.create()
        let tempDir: string | undefined

        beforeEach(async function () {
            tempDir = await filesystemUtilities.makeTemporaryToolkitFolder()
            context.extensionPath = tempDir
        })

        afterEach(async function () {
            if (tempDir) {
                await remove(tempDir)
            }
        })

        it("throws error if a quick start page doesn't exist", async () => {
            await assert.rejects(createQuickStartWebview(context, 'irresponsibly-named-file'))
        })

        it('returns a webview with unaltered text if a valid file is passed without tokens', async function () {
            const filetext = 'this temp page does not have any tokens'
            const filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
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
            await writeFile(path.join(context.extensionPath, filepath), filetext)
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
            const extContext = await FakeExtensionContext.create()
            extContext.globalState.update(mostRecentVersionKey, goodVersion)

            assert.strictEqual(isDifferentVersion(extContext, goodVersion), false)
        })

        it("returns true if a most recent version isn't set", async () => {
            const extContext = await FakeExtensionContext.create()

            assert.ok(isDifferentVersion(extContext))
        })

        it("returns true if a most recent version doesn't match the current version", async () => {
            const oldVersion = '1.2.3'
            const newVersion = '4.5.6'
            const extContext = await FakeExtensionContext.create()
            extContext.globalState.update(mostRecentVersionKey, oldVersion)

            assert.ok(isDifferentVersion(extContext, newVersion))
        })
    })

    describe('setMostRecentVersion', function () {
        it('sets the most recent version', async function () {
            const extContext = await FakeExtensionContext.create()
            setMostRecentVersion(extContext)

            assert.strictEqual(extContext.globalState.get<string>(mostRecentVersionKey), extensionVersion)
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

    it('returns "unknown" if cloud9 and the MetadataService request fails', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').rejects({} as AWSError)

        await initializeComputeRegion(metadataService, true)
        assert.strictEqual(getComputeRegion(), 'unknown')
    })

    it('returns "unknown" if cloud9 and can not find a region', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').resolves({} as InstanceIdentity)

        await initializeComputeRegion(metadataService, true)
        assert.strictEqual(getComputeRegion(), 'unknown')
    })

    it('returns undefined if not cloud9', async function () {
        sandbox.stub(metadataService, 'getInstanceIdentity').callsArgWith(1, undefined, 'lol')

        await initializeComputeRegion(metadataService, false)
        assert.strictEqual(getComputeRegion(), undefined)
    })

    it('handles invalid endpoint or invalid response', async function () {
        await assert.rejects(metadataService.invoke('/bogus/path'))
    })
})

describe('ExtensionUserActivity', function () {
    let count: number

    function onEventTriggered() {
        count++
    }

    before(function () {
        count = 0
    })

    it('triggers twice when multiple user activities are fired in separate intervals', async function () {
        // IMPORTANT: This may be flaky in CI, so we may need to increase the intervals for more tolerance
        const throttleDelay = 200
        const eventsFirst = [delayedFiringEvent(100), delayedFiringEvent(101), delayedFiringEvent(102)]
        const eventsSecond = [
            delayedFiringEvent(250),
            delayedFiringEvent(251),
            delayedFiringEvent(251),
            delayedFiringEvent(252),
        ]
        const waitFor = 500 // some additional buffer to make sure everything triggers

        const instance = ExtensionUserActivity.instance(throttleDelay, [...eventsFirst, ...eventsSecond])
        instance.onUserActivity(onEventTriggered)
        await sleep(waitFor)

        assert.strictEqual(count, 2)
    })

    it('gives the same instance if the throttle delay is the same', function () {
        const instance1 = ExtensionUserActivity.instance(100)
        const instance2 = ExtensionUserActivity.instance(100)
        const instance3 = ExtensionUserActivity.instance(200)
        const instance4 = ExtensionUserActivity.instance(200)

        assert.strictEqual(instance1, instance2)
        assert.strictEqual(instance3, instance4)
        assert.notStrictEqual(instance1, instance3)
    })

    function delayedFiringEvent(fireInMillis: number): vscode.Event<any> {
        const event = new vscode.EventEmitter<void>()
        setTimeout(() => event.fire(), fireInMillis)
        return event.event
    }
})
