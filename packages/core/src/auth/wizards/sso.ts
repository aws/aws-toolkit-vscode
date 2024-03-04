/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { SsoClient } from '../sso/clients'
import { AccountInfo, RoleInfo } from '@aws-sdk/client-sso'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import { StepEstimator, Wizard } from '../../shared/wizards/wizard'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { SsoProfile } from '../sso/model'
import { ssoCredentialsHelpUrl } from '../../shared/constants'
import { assertHasProps } from '../../shared/utilities/tsUtils'

export function createStartUrlPrompter() {
    return createInputBox({
        title: localize('AWS.sso.promptStartUrl.title', 'Enter a start URL'),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

export function createAccountPrompter(provider: SsoAccessTokenProvider, region: string) {
    function toItem(account: AccountInfo & { accountId: string }) {
        return {
            label: account.accountId,
            description: account.accountName,
            detail: account.emailAddress,
            data: account,
        }
    }

    const client = SsoClient.create(region, provider)
    const items = client.listAccounts({}).map(accounts => accounts.map(toItem))

    return createQuickPick(items, {
        title: localize('AWS.sso.promptAccount.title', 'Select an account ({0})', region),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

export function createRolePrompter(provider: SsoAccessTokenProvider, region: string, accountId: string) {
    function toItem(role: Required<RoleInfo>) {
        return {
            label: role.roleName,
            data: role,
        }
    }

    const client = SsoClient.create(region, provider)
    const items = client.listAccountRoles({ accountId }).map(roles => roles.map(toItem))

    return createQuickPick(items, {
        title: localize('AWS.sso.promptRole.title', 'Select a role in {0} ({1})', accountId, region),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

// TODO(sijaden): replace this class with a proper abstraction for "tasks"
class TokenLoader extends Prompter<SsoAccessTokenProvider> {
    public constructor(private readonly profile: Pick<SsoProfile, 'region' | 'startUrl' | 'scopes'>) {
        super()
    }

    protected async promptUser(): Promise<PromptResult<SsoAccessTokenProvider>> {
        const provider = SsoAccessTokenProvider.create(this.profile)

        if (!(await provider.getToken())) {
            await provider.createToken()
        }

        return provider
    }

    public get recentItem(): any {
        return undefined
    }
    public set recentItem(response: any) {}
    public setStepEstimator(estimator: StepEstimator<SsoAccessTokenProvider>): void {}
    public setSteps(current: number, total: number): void {}
}

export type SsoWizardState = Required<Omit<SsoProfile, 'scopes'>> & {
    readonly tokenProvider: SsoAccessTokenProvider
}

export class SsoWizard extends Wizard<SsoWizardState> {
    public constructor(init: Partial<SsoProfile> = {}) {
        super({ initState: init })

        this.form.region.bindPrompter(() => createRegionPrompter().transform(r => r.id))
        this.form.startUrl.bindPrompter(createStartUrlPrompter)

        this.form.tokenProvider.bindPrompter(
            ({ region, startUrl }) => new TokenLoader({ region: region!, startUrl: startUrl!, scopes: init.scopes })
        )

        this.form.accountId.bindPrompter(state => {
            // If we fail here, we should just abort the wizard
            // prevents having to write messy back-tracking logic
            assertHasProps(state, 'tokenProvider', 'region')
            return createAccountPrompter(state.tokenProvider, state.region).transform(a => a.accountId)
        })
        this.form.roleName.bindPrompter(state => {
            assertHasProps(state, 'tokenProvider', 'region', 'accountId')
            return createRolePrompter(state.tokenProvider, state.region, state.accountId).transform(r => r.roleName)
        })
    }
}
