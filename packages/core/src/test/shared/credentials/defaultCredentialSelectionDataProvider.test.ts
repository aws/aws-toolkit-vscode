/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { QuickPickItem } from 'vscode'
import { CredentialSelectionDataProvider } from '../../../shared/credentials/credentialSelectionDataProvider'
import { CredentialSelectionState } from '../../../shared/credentials/credentialSelectionState'
import {
    credentialProfileSelector,
    promptToDefineCredentialsProfile,
} from '../../../shared/credentials/defaultCredentialSelectionDataProvider'
import { MultiStepInputFlowController } from '../../../shared/multiStepInputFlowController'

describe('defaultCredentialSelectionDataProvider', function () {
    describe('credentialProfileSelector', function () {
        it('stops on selection of existing profile name', async function () {
            // need to find a better mock solution
            class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
                public constructor(public readonly existingProfileNames: string[]) {}

                public async pickCredentialProfile(
                    input: MultiStepInputFlowController,
                    actions: QuickPickItem[],
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

            const profileNames: string[] = ['profile1', 'profile2', 'profile3']

            const dataProvider = new MockCredentialSelectionDataProvider(profileNames)
            const state: CredentialSelectionState | undefined = await credentialProfileSelector(dataProvider)

            assert(state)
            assert(state!.credentialProfile)
            assert.strictEqual(state!.credentialProfile!.label, profileNames[1])
            assert.strictEqual(state!.profileName, undefined)
        })
    })

    describe('promptToDefineCredentialsProfile', function () {
        it('populates prompt with profiles from from data provider', async function () {
            const sampleProfileName: string = 'demoProfile'
            const sampleAccessKey: string = 'ABCD1234'
            const sampleSecretKey: string = '!@#$!@#$'

            // need to find a better mock solution
            class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
                public constructor(public readonly existingProfileNames: string[]) {}

                public async pickCredentialProfile(
                    input: MultiStepInputFlowController,
                    actions: QuickPickItem[],
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

            const profileNames: string[] = ['profile1', 'profile2', 'profile3']

            const dataProvider = new MockCredentialSelectionDataProvider(profileNames)
            const credentialState: CredentialSelectionState | undefined = await promptToDefineCredentialsProfile(
                dataProvider
            )

            assert(credentialState)
            assert(credentialState!.accesskey)
            assert.strictEqual(credentialState!.accesskey, sampleAccessKey)
            assert(credentialState!.profileName)
            assert.strictEqual(credentialState!.profileName, sampleProfileName)
            assert(credentialState!.secretKey)
            assert.strictEqual(credentialState!.secretKey, sampleSecretKey)
        })
    })
})
