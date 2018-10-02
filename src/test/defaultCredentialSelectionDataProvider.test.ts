/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { QuickPickItem, Uri } from 'vscode'
import {
    AddProfileButton,
    CredentialSelectionDataProvider
} from '../shared/credentials/credentialSelectionDataProvider'
import { CredentialSelectionState } from '../shared/credentials/credentialSelectionState'
import { credentialProfileSelector } from '../shared/credentials/defaultCredentialSelectionDataProvider'
import { MultiStepInputFlowController } from '../shared/multiStepInputFlowController'

suite('CredentialProfileSelector Tests', function(): void {

    test('selector stops on selection of existing profile name', async function() {

        // need to find a better mock solution
        class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
            public constructor(public readonly existingProfileNames: string[]) {
            }

            public async pickCredentialProfile(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<QuickPickItem | AddProfileButton> {
                return new Promise<QuickPickItem | AddProfileButton>(resolve => {
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
        const state = await credentialProfileSelector(dataProvider)

        return new Promise<void>((resolve, reject) => {
            if (state && state.credentialProfile) {
                assert.equal(state.credentialProfile.label, profileNames[1])
                assert.equal(state.profileName, undefined)
                resolve()
            } else {
                reject('state or the credentialProfile member is undefined, expected a profile name')
            }
        })
    })

    test('selector returns new profile details', async function() {

        // need to find a better mock solution
        const button = new AddProfileButton(
            {
                dark: Uri.file('resources/dontcare'),
                light: Uri.file('resources/dontcare')
            },
            'dontcare'
        )

        class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
            public constructor(public readonly existingProfileNames: string[]) {
            }

            public async pickCredentialProfile(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<QuickPickItem | AddProfileButton> {
                return new Promise<QuickPickItem | AddProfileButton>(resolve => {
                    resolve(button)
                })
            }

            public async inputProfileName(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return 'newProfileName'
            }

            public async inputAccessKey(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return 'newAccesskey'
            }

            public async inputSecretKey(
                input: MultiStepInputFlowController,
                partialState: Partial<CredentialSelectionState>
            ): Promise<string | undefined> {
                return 'newSecretkey'
            }
        }

        const profileNames: string[] = [
        ]

        const dataProvider = new MockCredentialSelectionDataProvider(profileNames)
        const state = await credentialProfileSelector(dataProvider)

        return new Promise<void>((resolve, reject) => {
            if (state) {
                assert.equal(state.credentialProfile, undefined)
                assert.equal(state.profileName, 'newProfileName')
                assert.equal(state.accesskey, 'newAccesskey')
                assert.equal(state.secretKey, 'newSecretkey')
                resolve()
            } else {
                reject('state is undefined')
            }
        })
    })
})
