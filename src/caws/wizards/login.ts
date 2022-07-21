/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCommonButtons } from '../../shared/ui/buttons'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { StepEstimator, Wizard } from '../../shared/wizards/wizard'
import { CawsAccount, CawsAuthenticationProvider, CawsSession } from '../auth'
import { window, ProgressLocation } from 'vscode'
import { getLogger } from '../../shared/logger/logger'

function createUserPrompter(auth: CawsAuthenticationProvider) {
    const sessions = auth.listSessions()
    const items = auth.listAccounts().map(acc => {
        const oldSession = sessions.find(s => s.accountDetails.id === acc.id)

        return {
            label: acc.label,
            description: oldSession ? '(logged in)' : '',
            skipEstimate: true,
            // TODO: just change this back to a promise for items
            // or polish up the async callback flow to not be so jittery
            data: async () => {
                if (oldSession) {
                    return { ...acc, session: oldSession, available: true }
                }

                // Try to login
                const session = await auth.createSession(acc).catch(() => {})
                return { ...acc, session, available: !!session }
            },
        }
    })

    const addNewUserItem = {
        label: 'Add new user...',
        data: newAccount,
    }

    return createQuickPick<AccountSelection>(
        [...items, addNewUserItem] as any, // :(
        { title: 'Select a user', buttons: createCommonButtons() }
    )
}

// Using a symbol here is not great but it's the easiest path until I can factor the wizard code a bit further
type AccountSelection =
    | (CawsAccount & ({ available: true; session: CawsSession } | { available: false; session: void }))
    | typeof newAccount
const newAccount = Symbol('newAccount')
interface LoginWizardState {
    readonly account: AccountSelection
    // It makes sense for the wizard to encompass the full flow
    // That is, it should handle control flow from account selection all the way to final verification
    readonly session: CawsSession
}

// this wizard is layered on top of the basic auth provider, prompting the user to select saved accounts
// as well as 're-authenticating' (prompting for another cookie) if the credentials are invalid
export class LoginWizard extends Wizard<LoginWizardState> {
    public constructor(auth: CawsAuthenticationProvider) {
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
                new (class extends Prompter<CawsSession> {
                    public set recentItem(response: any) {}
                    public get recentItem(): any {
                        return
                    }

                    protected async promptUser(): Promise<PromptResult<CawsSession>> {
                        const account = state.account!

                        if (account !== newAccount && account.available) {
                            return account.session
                        }

                        return window.withProgress(
                            // XXX: the `cancel` button doesn't do anything right now
                            { location: ProgressLocation.Notification, cancellable: true },
                            async progress => {
                                progress.report({ message: 'Logging in...' })
                                if (account !== newAccount) {
                                    return auth.createSession(account).catch(async error => {
                                        // Usually you'd only get to this point if the refresh token itself expired
                                        getLogger().error(`REMOVED.codes: failed to login: %O`, error)
                                        await auth.deleteAccount(account)
                                        return auth.createSession(await auth.createAccount())
                                    })
                                } else {
                                    return auth.createSession(await auth.createAccount())
                                }
                            }
                        )
                    }

                    public setSteps(current: number, total: number): void {}
                    public setStepEstimator(estimator: StepEstimator<CawsSession>): void {}
                })()
        )
    }
}
