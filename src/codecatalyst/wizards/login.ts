/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCommonButtons } from '../../shared/ui/buttons'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { StepEstimator, Wizard } from '../../shared/wizards/wizard'
import { CodeCatalystAccount, CodeCatalystAuthenticationProvider, CodeCatalystSession } from '../auth'
import { window, ProgressLocation } from 'vscode'
import { getLogger } from '../../shared/logger/logger'

function createUserPrompter(auth: CodeCatalystAuthenticationProvider) {
    const items = auth.listAccounts().map(acc => {
        const isLoggedIn = auth.activeAccount?.id === acc.id

        return {
            label: acc.label,
            description: isLoggedIn ? '(logged in)' : '',
            skipEstimate: true,
            data: acc,
        }
    })

    const addNewUserItem = {
        label: 'Add new user...',
        data: newAccount,
    }

    return createQuickPick<AccountSelection>([...items, addNewUserItem] as DataQuickPickItem<AccountSelection>[], {
        title: 'Select a user',
        buttons: createCommonButtons(),
    })
}

// Using a symbol here is not great but it's the easiest path until I can factor the wizard code a bit further
const newAccount = Symbol('newAccount')
type AccountSelection = CodeCatalystAccount | typeof newAccount
interface LoginWizardState {
    readonly account: AccountSelection
    // It makes sense for the wizard to encompass the full flow
    // That is, it should handle control flow from account selection all the way to final verification
    readonly session: CodeCatalystSession
}

// this wizard is layered on top of the basic auth provider, prompting the user to select saved accounts
// as well as 're-authenticating' (prompting for another cookie) if the credentials are invalid
export class LoginWizard extends Wizard<LoginWizardState> {
    public constructor(auth: CodeCatalystAuthenticationProvider) {
        super()
        this.form.account.bindPrompter(() => createUserPrompter(auth))

        // Little bit of a hack to show a progress notification within the wizard itself
        // Really the wizard should be completely agnostic to UI and allow any async task, not just prompts
        // But I never got around to generalizing the logic. My ideal version of 'Wizard' would be
        // just a convenient way to describe state machines (Moore machines to be specific)
        //
        // Having a wizard only deal with UI works ok, but it quickly starts to get clunky as long-running
        // steps are interwoven with prompts. From a pure logic perspective, the implementation doesn't
        // need to know that a step is user-facing or not.
        this.form.session.bindPrompter(
            state =>
                new (class extends Prompter<CodeCatalystSession> {
                    public set recentItem(response: any) {}
                    public get recentItem(): any {
                        return
                    }

                    protected async promptUser(): Promise<PromptResult<CodeCatalystSession>> {
                        const account = state.account!

                        return window.withProgress(
                            // XXX: the `cancel` button doesn't do anything right now
                            { location: ProgressLocation.Notification, cancellable: true },
                            async progress => {
                                progress.report({ message: 'Logging in...' })
                                if (account !== newAccount) {
                                    return auth.login(account).catch(async error => {
                                        // Usually you'd only get to this point if the refresh token itself expired
                                        getLogger().error(`codecatalyst: failed to login: %O`, error)
                                        await auth.deleteAccount(account)

                                        return auth.login(await auth.createAccount())
                                    })
                                } else {
                                    return auth.login(await auth.createAccount())
                                }
                            }
                        )
                    }

                    public setSteps(current: number, total: number): void {}
                    public setStepEstimator(estimator: StepEstimator<CodeCatalystSession>): void {}
                })()
        )
    }
}
