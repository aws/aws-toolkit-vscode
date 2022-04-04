/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export function createStartUrlPrompter() {
    return createInputBox({
        title: localize('aws.sso.promptStartUrl.title', 'Enter a start URL'),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

export function createAccountPrompter(region: string, accessToken: string) {
    function toItem(account: AccountInfo & { accountId: string }) {
        return {
            label: account.accountId,
            description: account.accountName,
            detail: account.emailAddress,
            data: account,
        }
    }

    const client = SsoClient.create(region)
    const items = client.listAccounts({ accessToken }).map(accounts => accounts.map(toItem))

    return createQuickPick(items, {
        title: localize('aws.sso.promptAccount.title', 'Select an account ({0})', region),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

export function createRolePrompter(region: string, accessToken: string, accountId: string) {
    function toItem(role: Required<RoleInfo>) {
        return {
            label: role.roleName,
            data: role,
        }
    }

    const client = SsoClient.create(region)
    const items = client.listAccountRoles({ accessToken, accountId }).map(roles => roles.map(toItem))

    return createQuickPick(items, {
        title: localize('aws.sso.promptRole.title', 'Select a role in {0} ({1})', accountId, region),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

// TODO(sijaden): replace this class with a proper abstraction for "tasks"
class TokenLoader extends Prompter<string> {
    public constructor(private readonly profile: Pick<SsoProfile, 'region' | 'startUrl'>) {
        super()
    }

    protected async promptUser(): Promise<PromptResult<string>> {
        const provider = SsoAccessTokenProvider.create(this.profile)
        const token = await provider.getOrCreateToken()

        return token.accessToken
    }

    public get recentItem(): any {
        return undefined
    }
    public set recentItem(response: any) {}
    public setStepEstimator(estimator: StepEstimator<string>): void {}
    public setSteps(current: number, total: number): void {}
}

export type SsoWizardState = Required<Omit<SsoProfile, 'scopes'>> & { readonly accessToken: string }

export class SsoWizard extends Wizard<SsoWizardState> {
    public constructor(init: Partial<SsoProfile> = {}) {
        super({ initState: init })

        this.form.region.bindPrompter(() => createRegionPrompter().transform(r => r.id))
        this.form.startUrl.bindPrompter(createStartUrlPrompter)

        this.form.accessToken.bindPrompter(
            ({ region, startUrl }) => new TokenLoader({ region: region!, startUrl: startUrl! })
        )

        this.form.accountId.bindPrompter(({ region, accessToken }) =>
            createAccountPrompter(region!, accessToken!).transform(a => a.accountId)
        )
        this.form.roleName.bindPrompter(({ region, accessToken, accountId }) =>
            createRolePrompter(region!, accessToken!, accountId!).transform(r => r.roleName)
        )
    }
}
