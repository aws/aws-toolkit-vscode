/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createWizardTester } from '../../shared/wizards/wizardTestUtils'
import { CreateProfileWizard, ProfileTemplateProvider } from '../../../credentials/wizards/createProfile'
import {
    processCredentialsTemplate,
    ProfileKey,
    staticCredentialsTemplate,
} from '../../../credentials/wizards/templates'
import { Prompter, PromptResult } from '../../../shared/ui/prompter'
import { StepEstimator } from '../../../shared/wizards/wizard'
import { Profile } from '../../../credentials/sharedCredentials'

class TestPrompter extends Prompter<string | undefined> {
    public constructor(private readonly name: string, private readonly profile: Profile) {
        super()
    }

    protected async promptUser(): Promise<PromptResult<string>> {
        return JSON.stringify({ [this.name]: this.profile })
    }

    public setStepEstimator(estimator: StepEstimator<string>): void {}
    public setSteps(current: number, total: number): void {}
    public set recentItem(response: any) {}
    public get recentItem(): any {
        return
    }
}

describe('CreateProfileWizard', function () {
    it('prompts for profile name, access key, secret, and then validates (static)', function () {
        const tester = createWizardTester(new CreateProfileWizard({ foo: {} }, staticCredentialsTemplate))
        tester.name.assertShowFirst()
        tester.profile[ProfileKey.AccessKeyId].assertShowSecond()
        tester.profile[ProfileKey.SecretKey].assertShowThird()
        tester.accountId.assertShow(4)
    })

    it('prompts for profile name, command, and then validates (credential_process)', function () {
        const tester = createWizardTester(new CreateProfileWizard({ foo: {} }, processCredentialsTemplate))
        tester.name.assertShowFirst()
        tester.profile[ProfileKey.Process].assertShowSecond()
        tester.accountId.assertShowThird()
    })

    it('skips profile name step (and uses "default") if starting with no profiles', function () {
        const tester = createWizardTester(new CreateProfileWizard({}, processCredentialsTemplate))
        tester.name.assertDoesNotShow()
        tester.name.assertValue('default')
        tester.assertShowCount(2)
    })

    it('passes in the profile name + state to template prompts', async function () {
        const template: ProfileTemplateProvider<Profile> = {
            label: '',
            description: '',
            prompts: {
                step1: (name, profile) => new TestPrompter(name, profile),
                step2: (name, profile) => new TestPrompter(name, profile),
            },
        }

        const wizard = new CreateProfileWizard({}, template)
        wizard.form.name.bindPrompter(() => new TestPrompter('test', {}).transform(r => Object.keys(JSON.parse(r!))[0]))
        wizard.form.accountId.bindPrompter(() => new TestPrompter('', {}).transform(r => r!))

        const result = await wizard.run()
        const step1 = result?.profile?.['step1']
        const step2 = result?.profile?.['step2']
        assert.ok(step1)
        assert.ok(step2)
        assert.deepStrictEqual(JSON.parse(step1), { test: {} })
        assert.deepStrictEqual(JSON.parse(step2), { test: { step1 } })
    })
})
