/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { StepEstimator, Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { DefaultStsClient } from '../../shared/clients/stsClient'
import { createCommonButtons } from '../../shared/ui/buttons'
import { credentialHelpUrl } from '../../shared/constants'
import { showLoginFailedMessage } from '../credentials/utils'
import { ParsedIniData, Profile } from '../credentials/sharedCredentials'
import { SharedCredentialsKeys } from '../credentials/types'

function createProfileNamePrompter(profiles: ParsedIniData) {
    return createInputBox({
        title: localize('AWS.profileName.title', 'Enter a profile name'),
        prompt: localize('AWS.profileName.prompt', 'Choose a unique name for the new profile'),
        buttons: createCommonButtons(credentialHelpUrl),
        validateInput: name => {
            if (name === '') {
                return localize('AWS.credentials.error.emptyProfileName', 'Profile name must not be empty')
            }

            return Object.keys(profiles).includes(name) ? 'Name is not unique' : undefined
        },
    })
}

export interface ProfileTemplateProvider<T extends Record<string, any> = any> {
    readonly label: string
    readonly description: string
    readonly prompts: {
        readonly [P in keyof T]: (name: string, profile: Partial<T>) => Prompter<T[P]>
    }
}

export class CreateProfileWizard extends Wizard<CreateProfileState> {
    public constructor(profiles: { readonly [name: string]: Profile }, template: ProfileTemplateProvider) {
        super()

        if (Object.keys(profiles).length === 0) {
            // Skip the "Enter Profile" step and use "default" profile name.
            // This reduces friction for the common case.
            this.form.name.setDefault('default')
        } else {
            this.form.name.bindPrompter(() => createProfileNamePrompter(profiles))
        }

        for (const [k, v] of Object.entries(template.prompts)) {
            this.form.profile[k].bindPrompter(({ name, profile }) => v(name!, profile ?? {}))
        }

        this.form.accountId.bindPrompter(({ name, profile }) => new ProfileChecker(name!, profile))
    }
}

interface CreateProfileState {
    readonly name: string
    readonly profile: Profile
    readonly accountId: string
}

class ProfileChecker<T extends Profile> extends Prompter<string> {
    public constructor(private readonly name: string, private readonly profile: T) {
        super()
    }

    protected async promptUser(): Promise<PromptResult<string>> {
        // TODO(sijaden): de-dupe this and make it nicer
        const loadingBar = vscode.window.createQuickPick()
        loadingBar.title = `Checking profile ${this.name}`
        loadingBar.enabled = false
        loadingBar.busy = true
        loadingBar.show()

        try {
            const region = this.profile['region'] ?? 'us-east-1' // De-dupe this pattern
            const stsClient = new DefaultStsClient(region, {
                accessKeyId: this.profile[SharedCredentialsKeys.AWS_ACCESS_KEY_ID]!,
                secretAccessKey: this.profile[SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]!,
            })

            return (await stsClient.getCallerIdentity()).Account
        } catch (err) {
            showLoginFailedMessage(this.name, (err as any).message ?? '?')
            return WIZARD_BACK
        } finally {
            loadingBar.dispose()
        }
    }

    public setStepEstimator(estimator: StepEstimator<string>): void {}
    public setSteps(current: number, total: number): void {}
    public set recentItem(response: any) {}
    public get recentItem(): any {
        return
    }
}
