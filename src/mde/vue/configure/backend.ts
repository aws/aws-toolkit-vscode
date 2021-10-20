/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../../../shared/extensions'
import { createVueWebview } from '../../../webviews/main'
//import { FrontendCommand } from './parent.vue'

import * as nls from 'vscode-nls'
import { ext } from '../../../shared/extensionGlobals'
import { EnvironmentSettingsWizard, getAllInstanceDescriptions, SettingsForm } from '../../wizards/environmentSettings'
import { CreateEnvironmentRequest, GetEnvironmentMetadataResponse } from '../../../../types/clientmde'
import { getRegistryDevFiles, PUBLIC_REGISTRY_URI } from '../../wizards/devfiles'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { createCommands } from '../../../webviews/server'

const localize = nls.loadMessageBundle()
export interface DefinitionTemplate {
    name: string
    source: string
}

// TODO: make submit a special case (the only method that is generic)
// that way we can compose commands and still be type-safe
const commands = createCommands({
    getEnvironmentSummary,
    editSettings,
    async loadTemplates() {
        return getRegistryDevFiles().then(t =>
            t.map(name => ({
                name,
                source: PUBLIC_REGISTRY_URI.with({ path: `devfiles/${name}` }).toString(),
            }))
        )
    },
    openDevfile,
    getAllInstanceDescriptions,
    toggleMdeState,
})

export type Commands = typeof commands & { submit: (result: CreateEnvironmentRequest) => void } & {
    init: () => Promise<GetEnvironmentMetadataResponse>
}

export async function createMdeConfigureWebview(
    context: ExtContext,
    id?: string
): Promise<CreateEnvironmentRequest | undefined> {
    const submit = new Promise<CreateEnvironmentRequest | undefined>(async resolve => {
        await createVueWebview({
            id: 'configureMde',
            cssFiles: ['base.css'],
            name: localize('AWS.command.configureMdeForm.title', 'Environment settings'),
            webviewJs: 'createMdeConfigureVue.js',
            context,
            onSubmit: resolve,
            commands: {
                ...commands,
                getEnvironmentSummary: getEnvironmentSummary.bind(undefined, id),
                init: getEnvironmentSummary.bind(undefined, id),
            },
        })
    })
    return submit
}

async function getEnvironmentSummary(id?: string): Promise<GetEnvironmentMetadataResponse> {
    if (!id) {
        throw new Error('No id provided')
    }
    const summary = await ext.mde.getEnvironmentMetadata({ environmentId: id })
    if (!summary) {
        throw new Error('No env found')
    }
    return summary
}

// TODO: where should we present errors?
// ideally the webview should validate all data prior to submission
// though in the off-chance that something slips through, it would be bad UX to dispose of
// the create form prior to a successful create

async function editSettings(data: SettingsForm) {
    const settingsWizard = new EnvironmentSettingsWizard(data)
    const response = await settingsWizard.run()
    return response
}

async function openDevfile(uri: string | vscode.Uri) {
    uri = typeof uri === 'string' ? vscode.Uri.parse(uri, true) : uri
    if (uri.scheme === 'http' || uri.scheme === 'https') {
        const fetcher = new HttpResourceFetcher(uri.toString(), { showUrl: true })
        fetcher.get().then(content => {
            vscode.workspace.openTextDocument({ language: 'yaml', content })
        })
    } else if (uri.scheme === 'file') {
        vscode.workspace.openTextDocument(uri)
    }
}

async function toggleMdeState(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'status'>) {
    if (mde.status === 'RUNNING') {
        return ext.mde.stopEnvironment({ environmentId: mde.id })
    } else if (mde.status === 'STOPPED') {
        return ext.mde.startEnvironment({ environmentId: mde.id })
    } else {
        throw new Error('Environment is still in a pending state')
    }
}
