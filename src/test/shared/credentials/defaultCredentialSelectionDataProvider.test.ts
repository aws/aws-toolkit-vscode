/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Prompter, PromptResult } from '../../../shared/ui/prompter'
import {
    CredentialSelectionDataProvider,
    CredentialsWizard,
} from '../../../shared/credentials/defaultCredentialSelectionDataProvider'
import { MockPrompter } from '../wizards/wizardFramework'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'

describe('defaultCredentialSelectionDataProvider', function () {
    describe('credentialProfileSelector', function () {
        it('stops on selection of existing profile name', async function () {
            // need to find a better mock solution
            class MockCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
                public constructor(public readonly existingProfileNames: string[]) {}

                public createCredentialProfilePrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter(this.existingProfileNames[1])
                }
                public createProfileNamePrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter('shouldNeverGetHere')
                }
                public createAccessKeyPrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter<string>(WIZARD_BACK)
                }
                public createSecretKeyPrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter<string>(WIZARD_BACK)
                }
            }

            const profileNames: string[] = ['profile1', 'profile2', 'profile3']

            const dataProvider = new MockCredentialSelectionDataProvider(profileNames)
            const state = await new CredentialsWizard(dataProvider).run()

            assert(state)
            assert(state!.credentialProfile)
            assert.strictEqual(state!.credentialProfile!, profileNames[1])
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

                public createCredentialProfilePrompter(): Prompter<string, PromptResult<string>> {
                    throw new Error('Should never get here')
                }
                public createProfileNamePrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter(sampleProfileName)
                }
                public createAccessKeyPrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter(sampleAccessKey)
                }
                public createSecretKeyPrompter(): Prompter<string, PromptResult<string>> {
                    return new MockPrompter(sampleSecretKey)
                }
            }

            const dataProvider = new MockCredentialSelectionDataProvider([])
            const credentialState = await new CredentialsWizard(dataProvider).run()

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
