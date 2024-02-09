/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { Uri, Range } from 'vscode'
import { isEqual } from '../../../auth/providers/credentials'
import { SharedCredentialsProviderFactory } from '../../../auth/providers/sharedCredentialsProviderFactory'
import * as sharedCredentials from '../../../auth/credentials/sharedCredentials'
import { fsCommon } from '../../../srcShared/fs'
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
        sandbox.stub(fsCommon, 'stat').callsFake(async () => {
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
            providers.find(p =>
                isEqual(p.getCredentialsId(), {
                    credentialSource: 'profile',
                    credentialTypeId: validProfileName1,
                })
            ),
            'Expected to find the first profile'
        )
        assert.ok(
            providers.find(p =>
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

    it('refresh does not reload from file if the file has not changed', async function () {
        const sut = new SharedCredentialsProviderFactory()

        // First load
        await sut.refresh()

        // Expect: No reload
        await sut.refresh()

        assert.ok(
            loadSharedCredentialsSectionsStub.calledOnce,
            'Credentials should have only been loaded from disk once'
        )
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
})
