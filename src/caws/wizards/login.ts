/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { isValidResponse, Wizard, WIZARD_RETRY } from '../../shared/wizards/wizard'
import { fixcookie, getSavedCookies } from '../utils'

function createCookiePrompter() {
    return createInputBox({
        title: 'Enter cookie',
        placeholder: 'cookie: code-aws-cognito-session=...',
    }).transform(fixcookie)
}

function createUserPrompter(ctx: vscode.ExtensionContext) {
    const items = getSavedCookies(ctx.globalState, ctx.secrets).then(data =>
        data.map(d => ({
            label: d.name,
            data: d,
        }))
    )

    const addNewUserItem = {
        label: 'Add new user...',
        skipEstimate: true,
        data: async () => {
            const resp = await createCookiePrompter().prompt()
            return isValidResponse(resp) ? { name: '', cookie: resp, newUser: true } : WIZARD_RETRY
        },
    }

    return createQuickPick(
        items.then(i => [...i, addNewUserItem]),
        { title: 'Select a user' }
    )
}

interface LoginWizardState {
    readonly user: { name: string; cookie: string; newUser?: boolean }
}

// placeholder wizard, will probably need more steps later
export class LoginWizard extends Wizard<LoginWizardState> {
    public constructor(ctx: vscode.ExtensionContext) {
        super()
        this.form.user.bindPrompter(() => createUserPrompter(ctx))
    }
}
