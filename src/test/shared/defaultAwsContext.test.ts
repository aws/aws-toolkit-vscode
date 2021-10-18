/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as AWS from 'aws-sdk'
import { AwsContextCredentials } from '../../shared/awsContext'
import { regionSettingKey } from '../../shared/constants'
import { DefaultAwsContext } from '../../shared/awsContext'
import { FakeExtensionContext, FakeMementoStorage } from '../fakeExtensionContext'
import * as timeoutUtils from '../../shared/utilities/timeoutUtils'

describe('DefaultAwsContext', function () {
    const testRegion1Value: string = 're-gion-1'
    const testRegion2Value: string = 're-gion-2'
    const testRegion3Value: string = 're-gion-3'
    const testAccountIdValue: string = '123456789012'

    it('instantiates with no credentials', async function () {
        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        assert.strictEqual(testContext.getCredentialProfileName(), undefined)
        assert.strictEqual(testContext.getCredentialAccountId(), undefined)
        assert.strictEqual(await testContext.getCredentials(), undefined)
    })

    it('sets credentials and gets credentialsId', async function () {
        const awsCredentials = makeSampleAwsContextCredentials()

        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        await testContext.setCredentials(awsCredentials)
        assert.strictEqual(testContext.getCredentialProfileName(), awsCredentials.credentialsId)
    })

    it('sets undefined credentials and gets credentialsId', async function () {
        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        await testContext.setCredentials(undefined)
        assert.strictEqual(testContext.getCredentialProfileName(), undefined)
    })

    it('sets credentials and gets accountId', async function () {
        const awsCredentials = makeSampleAwsContextCredentials()

        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        await testContext.setCredentials(awsCredentials)
        assert.strictEqual(testContext.getCredentialAccountId(), awsCredentials.accountId)
    })

    it('sets undefined credentials and gets accountId', async function () {
        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        await testContext.setCredentials(undefined)
        assert.strictEqual(testContext.getCredentialAccountId(), undefined)
    })

    it('sets credentials and gets credentials', async function () {
        const awsCredentials = makeSampleAwsContextCredentials()

        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        await testContext.setCredentials(awsCredentials)
        assert.strictEqual(await testContext.getCredentials(), awsCredentials.credentials)
    })

    it('sets undefined credentials and gets credentials', async function () {
        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        await testContext.setCredentials(undefined)
        assert.strictEqual(await testContext.getCredentials(), undefined)
    })

    it('gets single region from config on startup', async function () {
        const fakeMementoStorage: FakeMementoStorage = {}
        fakeMementoStorage[regionSettingKey] = [testRegion1Value]

        const fakeExtensionContext = new FakeExtensionContext({
            globalState: fakeMementoStorage,
        })

        const testContext = new DefaultAwsContext(fakeExtensionContext)
        const regions = await testContext.getExplorerRegions()
        assert.strictEqual(regions.length, 1)
        assert.strictEqual(regions[0], testRegion1Value)
    })

    it('gets multiple regions from config on startup', async function () {
        const fakeMementoStorage: FakeMementoStorage = {}
        fakeMementoStorage[regionSettingKey] = [testRegion1Value, testRegion2Value]

        const fakeExtensionContext = new FakeExtensionContext({
            globalState: fakeMementoStorage,
        })

        const testContext = new DefaultAwsContext(fakeExtensionContext)
        const regions = await testContext.getExplorerRegions()
        assert.strictEqual(regions.length, 2)
        assert.strictEqual(regions[0], testRegion1Value)
        assert.strictEqual(regions[1], testRegion2Value)
    })

    it('updates globalState on single region change', async function () {
        const extensionContext = new FakeExtensionContext()
        const testContext = new DefaultAwsContext(extensionContext)
        await testContext.addExplorerRegion(testRegion1Value)

        const persistedRegions = extensionContext.globalState.get<string[]>(regionSettingKey)
        assert.ok(persistedRegions, 'Expected region data to be stored in globalState')
        assert.strictEqual(persistedRegions!.length, 1)
        assert.strictEqual(persistedRegions![0], testRegion1Value)
    })

    it('updates globalState on multiple region change', async function () {
        const extensionContext = new FakeExtensionContext()
        const testContext = new DefaultAwsContext(extensionContext)
        await testContext.addExplorerRegion(testRegion1Value, testRegion2Value)

        const persistedRegions = extensionContext.globalState.get<string[]>(regionSettingKey)
        assert.ok(persistedRegions, 'Expected region data to be stored in globalState')
        assert.strictEqual(persistedRegions!.length, 2)
        assert.strictEqual(persistedRegions![0], testRegion1Value)
        assert.strictEqual(persistedRegions![1], testRegion2Value)
    })

    it('updates globalState on region removal', async function () {
        const extensionContext = new FakeExtensionContext()
        const testContext = new DefaultAwsContext(extensionContext)
        await testContext.addExplorerRegion(testRegion1Value, testRegion2Value, testRegion3Value)
        await testContext.removeExplorerRegion(testRegion2Value)

        const persistedRegions = extensionContext.globalState.get<string[]>(regionSettingKey)
        assert.ok(persistedRegions, 'Expected region data to be stored in globalState')
        assert.strictEqual(persistedRegions!.length, 2)
        assert.strictEqual(persistedRegions![0], testRegion1Value)
        assert.strictEqual(persistedRegions![1], testRegion3Value)
    })

    it('fires event on credentials change', async function () {
        const testContext = new DefaultAwsContext(new FakeExtensionContext())

        const awsCredentials = makeSampleAwsContextCredentials()

        await new Promise<void>(async resolve => {
            testContext.onDidChangeContext(awsContextChangedEvent => {
                assert.strictEqual(awsContextChangedEvent.profileName, awsCredentials.credentialsId)
                assert.strictEqual(awsContextChangedEvent.accountId, awsCredentials.accountId)
                resolve()
            })

            await testContext.setCredentials(awsCredentials)
        })
    })

    it('setDeveloperMode()', async function () {
        const testContext = new DefaultAwsContext(new FakeExtensionContext())
        let result: Set<string> | undefined
        /** How many times did the event fire? */
        let count = 0
        testContext.onDidChangeContext(ev => {
            result = ev.developerMode
            count = count + 1
        })

        // Enable "developer mode".
        await testContext.setDeveloperMode(true, 'aws.forceCloud9')
        // Attempt redundant trigger.
        await testContext.setDeveloperMode(true, 'aws.forceCloud9')
        // Attempt redundant trigger.
        await testContext.setDeveloperMode(true, 'aws.forceCloud9')
        await testContext.setDeveloperMode(true, 'aws.developer.foo1')

        await timeoutUtils.waitUntil(async () => result !== undefined && result.size >= 2, {
            timeout: 1000,
            interval: 100,
            truthy: true,
        })

        assert(result !== undefined)
        assert.deepStrictEqual(Array.from(result), ['aws.forceCloud9', 'aws.developer.foo1'])
        assert.deepStrictEqual(2, count)

        // Disable "developer mode".
        await testContext.setDeveloperMode(false, undefined)
        // Attempt redundant trigger.
        await testContext.setDeveloperMode(false, undefined)
        await timeoutUtils.waitUntil(async () => result === undefined || result.size === 0, {
            timeout: 1000,
            interval: 100,
            truthy: true,
        })

        assert.deepStrictEqual(Array.from(result), [])
        assert.deepStrictEqual(3, count)
    })

    function makeSampleAwsContextCredentials(): AwsContextCredentials {
        return {
            credentials: {} as any as AWS.Credentials,
            credentialsId: 'qwerty',
            accountId: testAccountIdValue,
        }
    }
})
