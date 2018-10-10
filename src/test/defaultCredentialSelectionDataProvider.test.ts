/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { QuickPickItem } from 'vscode'
import { CredentialSelectionDataProvider } from '../shared/credentials/credentialSelectionDataProvider'
import { CredentialSelectionState } from '../shared/credentials/credentialSelectionState'
import {
    credentialProfileSelector,
    promptToDefineCredentialsProfile
} from '../shared/credentials/defaultCredentialSelectionDataProvider'
import { MultiStepInputFlowController } from '../shared/multiStepInputFlowController'

suite('CredentialProfileSelector Tests', () => {

    test('selector stops on selection of existing profile name', async () => {

        // need to find a better mock solution
        class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
            public constructor(public readonly existingProfileNames: string[]) {
            }

            public async pickCredentialProfile(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<QuickPickItem> {
                return new Promise<QuickPickItem>(resolve => {
                    resolve({ label: this.existingProfileNames[1] })
                })
            }

            public async inputProfileName(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return 'shouldNeverGetHere'
            }

            public async inputAccessKey(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return undefined
            }

            public async inputSecretKey(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return undefined
            }
        }

        const profileNames: string[] = [
            'profile1',
            'profile2',
            'profile3'
        ]

        const dataProvider = new MockCredentialSelectionDataProvider(profileNames)
        const state: CredentialSelectionState | undefined = await credentialProfileSelector(dataProvider)

        assert(state)
        assert(state!.credentialProfile)
        assert.equal(state!.credentialProfile!.label, profileNames[1])
        assert.equal(state!.profileName, undefined)
    })

    test('CredentialSelectionState population from promptToDefineCredentialsProfile', async () => {

        const sampleProfileName: string = 'demoProfile'
        const sampleAccessKey: string = 'ABCD1234'
        const sampleSecretKey: string = '!@#$!@#$'

        // need to find a better mock solution
        class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
            public constructor(public readonly existingProfileNames: string[]) {
            }

            public async pickCredentialProfile(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<QuickPickItem> {
                throw new Error('Should never get here')
            }

            public async inputProfileName(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return sampleProfileName
            }

            public async inputAccessKey(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return sampleAccessKey
            }

            public async inputSecretKey(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return sampleSecretKey
            }
        }

        const profileNames: string[] = [
            'profile1',
            'profile2',
            'profile3'
        ]

        const dataProvider = new MockCredentialSelectionDataProvider(profileNames)
        const credentialState: CredentialSelectionState | undefined =
            await promptToDefineCredentialsProfile(dataProvider)

        assert(credentialState)
        assert(credentialState!.accesskey)
        assert.equal(credentialState!.accesskey, sampleAccessKey)
        assert(credentialState!.profileName)
        assert.equal(credentialState!.profileName, sampleProfileName)
        assert(credentialState!.secretKey)
        assert.equal(credentialState!.secretKey, sampleSecretKey)
    })
})
