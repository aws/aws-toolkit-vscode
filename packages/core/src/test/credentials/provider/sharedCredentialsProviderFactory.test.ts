/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { Uri, Range } from 'vscode'
import { isEqual } from '../../../auth/providers/credentials'
import { CredentialsProviderManager } from '../../../auth/providers/credentialsProviderManager'
import { SharedCredentialsProvider } from '../../../auth/providers/sharedCredentialsProvider'
import { SharedCredentialsProviderFactory } from '../../../auth/providers/sharedCredentialsProviderFactory'
import * as sharedCredentials from '../../../auth/credentials/sharedCredentials'
import fs from '../../../shared/fs/fs'
import vscode from 'vscode'

describe('SharedCredentialsProviderFactory', async function () {
    let sandbox: sinon.SinonSandbox
    let loadSharedCredentialsSectionsStub: sinon.SinonStub<
        [],
        ReturnType<typeof sharedCredentials.loadSharedCredentialsSections>
    >

    let sharedCredentialsLastModifiedMillis: number

    let sharedCredentialProfiles: Map<string, sharedCredentials.Profile>

    const validProfile: sharedCredentials.Profile = {
        aws_access_key_id: 'x',
        aws_secret_access_key: 'y',
    }

    const inValidProfile: sharedCredentials.Profile = {
        aws_access_key_id: 'x',
    }

    const validProfileName1 = 'default'
    const validProfileName2 = 'alt'
    const invalidProfileName = 'gary'

    beforeEach(async function () {
        sandbox = sinon.createSandbox()

        sharedCredentialsLastModifiedMillis = 1
        sandbox.stub(fs, 'stat').callsFake(async () => {
            return {
                mtime: sharedCredentialsLastModifiedMillis,
            } as any as vscode.FileStat
        })

        sharedCredentialProfiles = new Map<string, sharedCredentials.Profile>()
        sharedCredentialProfiles.set(validProfileName1, validProfile)
        sharedCredentialProfiles.set(validProfileName2, validProfile)

        loadSharedCredentialsSectionsStub = sandbox
            .stub(sharedCredentials, 'loadSharedCredentialsSections')
            .callsFake(async () => ({
                sections: Array.from(sharedCredentialProfiles.entries()).map(([k, v]) => ({
                    name: k,
                    type: 'profile',
                    assignments: Object.entries(v).map(([key, value]) => ({
                        key,
                        value: value!,
                        range: new Range(0, 0, 0, 0),
                    })),
                    source: Uri.file(''),
                    startLines: [],
                })),
                errors: [],
            }))
    })

    afterEach(async function () {
        sandbox.restore()
    })

    it('produces credential providers from shared credentials profiles', async function () {
        const sut = new SharedCredentialsProviderFactory()

        await sut.refresh()

        const providers = sut.listProviders()

        assert.strictEqual(providers.length, 2, 'Expected two providers to be created')
        assert.ok(
            providers.find((p) =>
                isEqual(p.getCredentialsId(), {
                    credentialSource: 'profile',
                    credentialTypeId: validProfileName1,
                })
            ),
            'Expected to find the first profile'
        )
        assert.ok(
            providers.find((p) =>
                isEqual(p.getCredentialsId(), {
                    credentialSource: 'profile',
                    credentialTypeId: validProfileName2,
                })
            ),

            'Expected to find the second profile'
        )
    })

    it('does not load providers for invalid profiles', async function () {
        sharedCredentialProfiles.set(invalidProfileName, inValidProfile)

        const sut = new SharedCredentialsProviderFactory()

        await sut.refresh()

        const providers = sut.listProviders()

        assert.strictEqual(providers.length, 2, 'Expected two providers to be created') // the valid ones
        assert.strictEqual(
            sut.getProvider({
                credentialSource: 'profile',
                credentialTypeId: invalidProfileName,
            }),
            undefined
        )
    })

    it('refresh always reloads from file', async function () {
        const sut = new SharedCredentialsProviderFactory()

        // First load
        await sut.refresh()

        // Expect: No reload
        await sut.refresh()

        assert.ok(loadSharedCredentialsSectionsStub.calledTwice, 'Credentials should have loaded from disk twice')
    })

    it('refresh reloads from file if the file has changed', async function () {
        const sut = new SharedCredentialsProviderFactory()

        // First load
        await sut.refresh()

        // Simulate modifying files
        sharedCredentialsLastModifiedMillis++

        // Expect: Reload
        await sut.refresh()

        assert.ok(loadSharedCredentialsSectionsStub.calledTwice, 'Credentials should have been loaded from disk twice')
    })

    it('shares one load between concurrent refreshes', async function () {
        const sut = new SharedCredentialsProviderFactory()

        await Promise.all(Array.from({ length: 50 }, () => sut.refresh()))

        assert.strictEqual(loadSharedCredentialsSectionsStub.callCount, 1)
        assert.strictEqual(sut.listProviders().length, 2)
    })

    it('gives a refresh made during a load its own load, even if that load fails', async function () {
        let entered!: () => void
        const loading = new Promise<void>((resolve) => (entered = resolve))
        let release!: () => void
        const gate = new Promise<void>((resolve) => (release = resolve))
        loadSharedCredentialsSectionsStub.onFirstCall().callsFake(async () => {
            entered()
            await gate
            throw new Error('load failed')
        })
        const sut = new SharedCredentialsProviderFactory()

        const first = sut.refresh()
        await loading
        sharedCredentialProfiles.set('added', validProfile)
        const second = sut.refresh()
        release()

        assert.deepStrictEqual(
            (await Promise.allSettled([first, second])).map((r) => r.status),
            ['rejected', 'fulfilled']
        )
        assert.ok(sut.getProvider({ credentialSource: 'profile', credentialTypeId: 'added' }))
    })

    it('looks providers up by profile name', async function () {
        const sut = new SharedCredentialsProviderFactory()
        await sut.refresh()

        assert.ok(sut.getProvider({ credentialSource: 'profile', credentialTypeId: validProfileName1 }))
        assert.strictEqual(sut.getProvider({ credentialSource: 'profile', credentialTypeId: 'missing' }), undefined)
        assert.strictEqual(sut.getProvider({ credentialSource: 'env', credentialTypeId: validProfileName1 }), undefined)

        sharedCredentialProfiles.delete(validProfileName1)
        await sut.refresh()

        assert.strictEqual(
            sut.getProvider({ credentialSource: 'profile', credentialTypeId: validProfileName1 }),
            undefined
        )
    })

    it('never exposes a partial list to a lookup that starts mid-load', async function () {
        for (let i = 0; i < 100; i++) {
            sharedCredentialProfiles.set(`p${i}`, validProfile)
        }
        const sut = new SharedCredentialsProviderFactory()
        const manager = new CredentialsProviderManager()
        manager.addProviderFactory(sut)
        const lookups: Promise<unknown>[] = []
        sandbox
            .stub(SharedCredentialsProvider.prototype, 'isAvailable')
            .callThrough()
            .onCall(19)
            .callsFake(async () => {
                lookups.push(manager.getCredentialsProvider({ credentialSource: 'profile', credentialTypeId: 'p99' }))
                return true
            })

        const all = await manager.getAllCredentialsProviders()
        await Promise.all(lookups)

        assert.strictEqual(new Set(all.map((p) => p.getCredentialsId().credentialTypeId)).size, 102)
        assert.strictEqual(all.length, 102)
    })
})
