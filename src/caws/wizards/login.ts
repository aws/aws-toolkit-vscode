/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccountDetails, Session } from '../../credentials/session'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { StepEstimator, Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { CawsAuthenticationProvider } from '../auth'
import { fixcookie } from '../utils'
import { window, ProgressLocation } from 'vscode'

function createCookiePrompter() {
    return createInputBox({
        title: 'Enter cookie',
        placeholder: 'cookie: code-aws-cognito-session=...',
        buttons: createCommonButtons(),
    }).transform(fixcookie)
}

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
                    return oldSession
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

    return createQuickPick<CawsAccount>(
        [...items, addNewUserItem] as any, // :(
        { title: 'Select a user', buttons: createCommonButtons() }
    )
}

// Using a symbol here is not great but it's the easiest path until I can factor the wizard code a bit further
type CawsAccount =
    | (AccountDetails & ({ available: true; session: Session } | { available: false; session: void }))
    | typeof newAccount
const newAccount = Symbol('New CAWS account')
interface LoginWizardState {
    readonly account: CawsAccount
    readonly cookie?: string
    // It makes sense for the wizard to encompass the full flow
    // That is, it should handle control flow from account selection all the way to final verification
    readonly session: Session
}

// this wizard is layered on top of the basic auth provider, prompting the user to select saved accounts
// as well as 're-authenticating' (prompting for another cookie) if the credentials are invalid
export class LoginWizard extends Wizard<LoginWizardState> {
    public constructor(auth: CawsAuthenticationProvider) {
        super()
        this.form.account.bindPrompter(() => createUserPrompter(auth))
        this.form.cookie.bindPrompter(() => createCookiePrompter(), {
            showWhen: state => state.account === newAccount || state.account?.available === false,
        }),
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
                    new (class extends Prompter<Session> {
                        public set recentItem(response: any) {}
                        public get recentItem(): any {
                            return
                        }

                        protected async promptUser(): Promise<PromptResult<Session>> {
                            const createSession = async () => {
                                const details = await auth.createAccount(state.cookie!)

                                if (state.account !== newAccount && details.id !== state.account?.id) {
                                    throw new Error('Cookie does not match account')
                                }

                                return auth.createSession(details)
                            }

                            try {
                                return await window.withProgress(
                                    { location: ProgressLocation.Notification },
                                    async progress => {
                                        progress.report({ message: 'Logging in...' })
                                        return createSession()
                                    }
                                )
                            } catch (err) {
                                const message = err instanceof Error ? err.message : String(err)
                                showViewLogsMessage(`Failed to login: ${message}`)
                                return WIZARD_BACK
                            }
                        }

                        public setSteps(current: number, total: number): void {}
                        public setStepEstimator(estimator: StepEstimator<Session>): void {}
                    })(),
                { showWhen: state => !!state.cookie }
            )

        // This is set if the account is valid on the first try
        this.form.session.setDefault(state =>
            state.account !== newAccount && state.account?.available ? state.account.session : undefined
        )
    }
}
