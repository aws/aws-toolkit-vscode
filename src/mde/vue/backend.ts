/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IAM } from 'aws-sdk'
import { ExtContext } from '../../shared/extensions'
import { createVueWebview } from '../../webviews/main'
//import { FrontendCommand } from './parent.vue'

import * as nls from 'vscode-nls'
import { ext } from '../../shared/extensionGlobals'
import { EnvironmentSettingsWizard, SettingsForm } from '../wizards/environmentSettings'
const localize = nls.loadMessageBundle()

interface LoadRolesCommand {
    command: 'loadRoles'
    data: IAM.Role[]
}

interface LoadDevFileTemplates {
    command: 'loadTemplates'
    data: DefinitionTemplate[]
}

interface LoadEnvironmentSettings {
    command: 'loadEnvironmentSettings'
    data: SettingsForm
}

export type BackendCommand = LoadRolesCommand | LoadDevFileTemplates | LoadEnvironmentSettings

export interface DefinitionTemplate {
    name: string
    source: vscode.Uri
}

export function registerCreateMdeCommand(context: ExtContext): vscode.Disposable {
    return vscode.commands.registerCommand('aws.mde.create', async () => {
        const roles = await loadRoles()
        await createVueWebview<any, any>({
            id: 'createMde',
            cssFiles: ['base.css'],
            name: localize('AWS.command.createMdeForm.title', 'Create new development environment'),
            webviewJs: 'createMdeVue.js',
            onDidReceiveMessageFunction: handleMessage,
            context: context.extensionContext,
            initialCalls: [
                {
                    command: 'loadRoles',
                    data: roles,
                },
            ],
        })
    })
}

function handleMessage(message: any, post: (response: any) => Promise<boolean>, destroy: () => void) {
    if (message.command === 'submit') {
        // TODO: where should we present errors?
        // ideally the webview should validate all data prior to submission
        // though in the off-chance that something slips through, it would be bad UX to dispose of
        // the create form prior to a successful create
        const data = message.data
        vscode.window.showInformationMessage(`Role: ${data.selectedRoleName}\nTag count: ${data.tags.length}\n`)
    } else if (message.command === 'cancel') {
        destroy()
    } else if (message.command === 'editSettings') {
        ;(async function () {
            const settingsWizard = new EnvironmentSettingsWizard(message.data as SettingsForm)
            const response = await settingsWizard.run()

            if (response !== undefined) {
                post({
                    command: 'loadEnvironmentSettings',
                    data: response,
                } as LoadEnvironmentSettings)
            }
        })()
    }
}

async function loadRoles(): Promise<IAM.Role[]> {
    const client = ext.toolkitClientBuilder.createIamClient('us-east-1') // hard-coded region for now

    // Not paginated, limit to 10 roles since the native dropdown box lists like 50 items at once
    try {
        return await client.listRoles({ MaxItems: 10 })
    } catch (err) {
        vscode.window.showErrorMessage((err as Error).message)
        return []
    }
}
