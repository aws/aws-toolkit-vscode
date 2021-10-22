/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../../../shared/extensions'
import { createVueWebview } from '../../../webviews/main'
import * as nls from 'vscode-nls'
import { ext } from '../../../shared/extensionGlobals'
import { EnvironmentSettingsWizard, getAllInstanceDescriptions, SettingsForm } from '../../wizards/environmentSettings'
import { CreateEnvironmentRequest, GetEnvironmentMetadataResponse } from '../../../../types/clientmde'
import { getRegistryDevFiles, PUBLIC_REGISTRY_URI } from '../../wizards/devfiles'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { createCommands } from '../../../webviews/server'
import { DefaultMdeEnvironmentClient, GetStatusResponse } from '../../../shared/clients/mdeEnvironmentClient'
import { sleep } from '../../../shared/utilities/promiseUtilities'
import { compare } from 'fast-json-patch'
import { mdeDeleteCommand } from '../../mdeCommands'
import { MDE_RESTART_KEY } from '../../constants'
import { getLogger } from '../../../shared/logger/logger'

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
    updateDevfile,
    updateTags: (arn: string, tags: Record<string, string>) => {
        return computeTagDiff(arn, tags).then(diff => updateTags(arn, diff))
    },
    onEnvironmentUpdate: new vscode.EventEmitter<GetEnvironmentMetadataResponse>(),
    onDevfileUpdate: new vscode.EventEmitter<GetStatusResponse & { actionId: 'devfile' }>(),
    deleteEnvironment: (mde: Pick<GetEnvironmentMetadataResponse, 'id'>) => mdeDeleteCommand(mde),
    async restartEnvironment(mde: Pick<GetEnvironmentMetadataResponse, 'id'>) {
        return await restartEnvironment(this.context, mde)
    },
})

export type Commands = typeof commands & {
    submit: (result: CreateEnvironmentRequest) => void
    init: () => Promise<GetEnvironmentMetadataResponse & { connected: boolean }>
    onEnvironmentUpdate: vscode.EventEmitter<GetEnvironmentMetadataResponse & { connected: boolean }>
}

export async function createMdeConfigureWebview(
    context: ExtContext,
    id?: string
): Promise<CreateEnvironmentRequest | undefined> {
    const envClient = new DefaultMdeEnvironmentClient()
    const environmentId = id ?? parseIdFromArn(envClient.arn ?? '')
    if (!environmentId) {
        throw new Error('Unable to resolve id for MDE environment')
    }
    const onEnvironmentUpdateEmitter = new vscode.EventEmitter<GetEnvironmentMetadataResponse>()
    const onDevfileUpdateEmitter = new vscode.EventEmitter<GetStatusResponse & { actionId: 'devfile' }>()
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
                onEnvironmentUpdate: onEnvironmentUpdateEmitter,
                onDevfileUpdate: onDevfileUpdateEmitter,
                getEnvironmentSummary: getEnvironmentSummary.bind(undefined, environmentId),
                init: getEnvironmentSummary.bind(undefined, environmentId),
                deleteEnvironment: async (mde: GetEnvironmentMetadataResponse) => {
                    const deleted = await mdeDeleteCommand(mde)
                    if (!deleted) {
                        return
                    }
                    pollDelete(mde).then(result => {
                        result && onEnvironmentUpdateEmitter.fire({ ...mde, status: 'DELETED' })
                    })
                    return deleted
                },
            },
        })
    })

    let done: boolean | undefined

        // Poll for devfile status changes
    ;(async function () {
        let previous: GetStatusResponse | undefined
        while (!done) {
            const resp = await envClient.getStatus()
            getLogger().debug('poll for environment status')
            if (resp.status !== previous?.status) {
                onDevfileUpdateEmitter.fire({ ...resp, actionId: 'devfile' })
            }
            previous = resp
            await sleep(10000)
        }
    })()

    // TODO: only poll if something has changed, clean this up...
    ;(async function () {
        let previous: GetEnvironmentMetadataResponse | undefined
        while (!done) {
            const response = await ext.mde.getEnvironmentMetadata({ environmentId })
            if (response?.status === 'DELETING') {
                break
            }
            if (!previous || response?.status !== previous.status) {
                onEnvironmentUpdateEmitter.fire(response)
            }
            previous = response
            await sleep(10000)
        }
    })()
    return submit.finally(() => (done = true))
}

// TODO: move to shared file
function parseIdFromArn(arn: string) {
    return arn.split('/').pop()
}

async function getEnvironmentSummary(id: string): Promise<GetEnvironmentMetadataResponse & { connected: boolean }> {
    const envClient = new DefaultMdeEnvironmentClient()
    const summary = await ext.mde.getEnvironmentMetadata({ environmentId: id })
    if (!summary) {
        throw new Error('No env found')
    }
    return { ...summary, connected: envClient.arn === summary.arn }
}

// TODO: where should we present errors?
// ideally the webview should validate all data prior to submission
// though in the off-chance that something slips through, it would be bad UX to dispose of
// the create form prior to a successful create

async function editSettings(data: SettingsForm, type?: 'create' | 'configure') {
    const settingsWizard = new EnvironmentSettingsWizard(data, type)
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
        vscode.window.showTextDocument(uri)
    }
}

function checkUnsavedChanges(): boolean {
    return vscode.workspace.textDocuments.some(doc => doc.isDirty)
}

async function toggleMdeState(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'status'> & { connected?: boolean }) {
    if (mde.status === 'RUNNING') {
        if (mde.connected && checkUnsavedChanges()) {
            // TODO: show confirmation prompt instead?
            vscode.window.showErrorMessage('Cannot stop current environment with unsaved changes')
            throw new Error('Cannot stop environment with unsaved changes')
        }
        return ext.mde.stopEnvironment({ environmentId: mde.id })
    } else if (mde.status === 'STOPPED') {
        return ext.mde.startEnvironment({ environmentId: mde.id })
    } else {
        throw new Error('Environment is still in a pending state')
    }
}

async function updateDevfile(location: string): Promise<void> {
    const client = new DefaultMdeEnvironmentClient()
    await client.startDevfile({ location })
    // TODO: start polling? restart the MDE?
}

// Poll a prop until it changes
async function pollStatus<T, K extends keyof T>(initial: T, provider: () => Promise<T>, prop: K): Promise<T[K]> {
    while (true) {
        const next = await provider()
        if (next[prop] !== initial[prop]) {
            return next[prop]
        }
        await sleep(10000)
    }
}

async function pollDelete(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'status'>) {
    const provider = () =>
        ext.mde
            .getEnvironmentMetadata({ environmentId: mde.id })
            .then(resp => {
                if (!resp) {
                    throw new Error('Undefined environment')
                }
                return resp
            })
            .catch(err => {
                if ((err as any).name === 'ResourceNotFoundException') {
                    return { status: 'DELETED' }
                }
                throw err
            })

    const result = await pollStatus({ status: mde.status }, provider, 'status')
    return !result
}

// Easier to compute the object diff here than on the frontend, although it requires one extra API call
async function computeTagDiff(arn: string, tags: Record<string, string>): Promise<Record<string, string | undefined>> {
    const environmentId = parseIdFromArn(arn)
    if (!environmentId) {
        throw new Error('Could not parse environment id from arn')
    }

    const env = await ext.mde.getEnvironmentMetadata({ environmentId })
    if (!env) {
        throw new Error('Could not retrieve environment tags')
    }

    const diff: Record<string, string | undefined> = {}
    const operations = compare(env.tags ?? {}, tags)
    operations.forEach(operation => {
        const key = operation.path.slice(1)
        if (operation.op === 'remove') {
            diff[key] = undefined
        } else if (operation.op === 'add' || operation.op === 'replace') {
            diff[key] = operation.value
        }
    })

    return diff
}

/**
 * Resolves the client's view of tags with the server's current state, adding/deleting tags as needed.
 *
 * @param arn ARN of the resource
 * @param tags Tag mapping of key/value pairs, undefined represents a deleted tag
 */
async function updateTags(arn: string, tags: Record<string, string | undefined>): Promise<void> {
    const deletedTags: string[] = []
    const filteredTags: Record<string, string> = {}

    Object.keys(tags)
        .filter(k => !k.startsWith('aws:'))
        .forEach(k => {
            const v = tags[k]
            if (v === undefined) {
                deletedTags.push(k)
            } else {
                filteredTags[k] = v
            }
        })

    await Promise.all([
        deletedTags.length > 0 ? ext.mde.untagResource(arn, deletedTags) : Promise.resolve(),
        Object.keys(filteredTags).length > 0 ? ext.mde.tagResource(arn, filteredTags) : Promise.resolve(),
    ])
}

/**
 * Restarts the environment. This stores context in global state.
 *
 * @param ctx
 * @param mde
 */
async function restartEnvironment(ctx: ExtContext, mde: Pick<GetEnvironmentMetadataResponse, 'id'>): Promise<void> {
    const memento = ctx.extensionContext.globalState
    const prev = memento.get<Record<string, boolean>>(MDE_RESTART_KEY, {})
    memento.update(MDE_RESTART_KEY, { ...prev, [mde.id]: true })

    // TODO: store which folder the user entered from??
    const home = vscode.Uri.parse('vscode://folder/Users/')
    await vscode.commands.executeCommand('vscode.openFolder', home)

    await ext.mde.stopEnvironment({ environmentId: mde.id }).catch(err => {
        memento.update(MDE_RESTART_KEY, prev)
        throw err
    })
}
