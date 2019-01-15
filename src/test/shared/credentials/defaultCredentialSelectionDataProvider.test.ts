/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import '../../shared/vscode/initialize'

import * as assert from 'assert'
import { CredentialSelectionDataProvider } from '../../../shared/credentials/credentialSelectionDataProvider'
import { CredentialSelectionState } from '../../../shared/credentials/credentialSelectionState'
import {
    credentialProfileSelector,
    promptToDefineCredentialsProfile
} from '../../../shared/credentials/defaultCredentialSelectionDataProvider'
import { MultiStepInputFlowController } from '../../../shared/multiStepInputFlowController'
import { types as vscode } from '../../../shared/vscode'

describe('defaultCredentialSelectionDataProvider', () => {

    describe('credentialProfileSelector', () => {

        it('stops on selection of existing profile name', async () => {

            // need to find a better mock solution
            class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
                public constructor(public readonly existingProfileNames: string[]) {
                }

                public async pickCredentialProfile(
                    input: MultiStepInputFlowController,
                    partialState: Partial<CredentialSelectionState>
                ): Promise<vscode.QuickPickItem> {
                    return new Promise<vscode.QuickPickItem>(resolve => {
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
            assert.strictEqual(state!.credentialProfile!.label, profileNames[1])
            assert.strictEqual(state!.profileName, undefined)
        })
    })

    describe('promptToDefineCredentialsProfile', () => {

        it('populates prompt with profiles from from data provider', async () => {

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
                ): Promise<vscode.QuickPickItem> {
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
            assert.strictEqual(credentialState!.accesskey, sampleAccessKey)
            assert(credentialState!.profileName)
            assert.strictEqual(credentialState!.profileName, sampleProfileName)
            assert(credentialState!.secretKey)
            assert.strictEqual(credentialState!.secretKey, sampleSecretKey)
        })
    })
})
