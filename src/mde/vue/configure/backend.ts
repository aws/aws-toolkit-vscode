/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { ExtContext } from '../../../shared/extensions'
import { compileVueWebview } from '../../../webviews/main'
import * as nls from 'vscode-nls'
import { EnvironmentSettingsWizard, getAllInstanceDescriptions, SettingsForm } from '../../wizards/environmentSettings'
import { CreateEnvironmentRequest, GetEnvironmentMetadataResponse } from '../../../../types/clientmde'
import { getRegistryDevFiles, PUBLIC_REGISTRY_URI } from '../../wizards/devfiles'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { RemoteEnvironmentClient, GetStatusResponse } from '../../../shared/clients/mdeEnvironmentClient'
import { compare } from 'fast-json-patch'
import { mdeConnectCommand, mdeDeleteCommand, tryRestart } from '../../mdeCommands'
import { getLogger } from '../../../shared/logger/logger'
import { parse } from '@aws-sdk/util-arn-parser'
import globals from '../../../shared/extensionGlobals'
import { checkUnsavedChanges } from '../../../shared/utilities/workspaceUtils'
import { sleep } from '../../../shared/utilities/timeoutUtils'

const localize = nls.loadMessageBundle()
export interface DefinitionTemplate {
    name: string
    source: string
}

const VueWebview = compileVueWebview({
    id: 'configureMde',
    title: localize('AWS.command.configureMdeForm.title', 'Environment settings'),
    webviewJs: 'mdeConfigureVue.js',
    viewColumn: vscode.ViewColumn.Active,
    start: (env: GetEnvironmentMetadataResponse & { connected: boolean }) => env,
    submit: (data: CreateEnvironmentRequest) => data,
    events: {
        onEnvironmentUpdate: new vscode.EventEmitter<GetEnvironmentMetadataResponse & { connected: boolean }>(),
        onDevfileUpdate: new vscode.EventEmitter<GetStatusResponse & { actionId: 'devfile' }>(),
    },
    commands: {
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
        async restartEnvironment(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'arn'>) {
            return tryRestart(mde.arn, async () => {
                await globals.mde.stopEnvironment({ environmentId: mde.id })
            })
        },
        async startDevfile(location: string) {
            const envClient = new RemoteEnvironmentClient()
            if (!envClient.arn) {
                throw new Error('Cannot start devfile when not in environment')
            }
            return tryRestart(envClient.arn, async () => {
                await envClient.startDevfile({ location, recreateHomeVolumes: true })
            })
        },
        getEnvironmentSummary() {
            return getEnvironmentSummary.bind(undefined, this.data.id)
        },
        async deleteEnvironment(mde: GetEnvironmentMetadataResponse) {
            const deleted = await mdeDeleteCommand(mde)
            if (!deleted) {
                return
            }
            pollDelete(mde).then(() => {
                this.emitters.onEnvironmentUpdate.fire({ ...mde, status: 'DELETED', connected: false })
            })
            return deleted
        },
        connect() {
            return mdeConnectCommand(this.data, parse(this.data.arn).region)
        },
    },
})

export class MdeConfigureWebview extends VueWebview {}

export async function createMdeConfigureWebview(
    context: ExtContext,
    id?: string
): Promise<CreateEnvironmentRequest | undefined> {
    const envClient = new RemoteEnvironmentClient()
    const environmentId = id ?? parseIdFromArn(envClient.arn ?? '')
    if (!environmentId) {
        throw new Error('Unable to resolve id for MDE environment')
    }

    const webview = new VueWebview(context)

    let done: boolean | undefined

    // Poll for devfile status changes
    const DEVFILE_POLL_RATE = 1000
    ;(async function () {
        while (!done) {
            const resp = await new RemoteEnvironmentClient().getStatus()
            getLogger().debug('poll for environment status')
            if (resp.status === 'CHANGED') {
                webview.emitters.onDevfileUpdate.fire({ ...resp, actionId: 'devfile' })
            }
            await sleep(DEVFILE_POLL_RATE)
        }
    })()

    // TODO: only poll if something has changed, clean this up...
    ;(async function () {
        let previous: GetEnvironmentMetadataResponse | undefined
        while (!done) {
            const response = await getEnvironmentSummary(environmentId)
            if (response?.status === 'DELETING') {
                break
            }
            if (!previous || response?.status !== previous.status) {
                webview.emitters.onEnvironmentUpdate.fire(response)
            }
            previous = response
            await sleep(10000)
        }
    })()

    return webview.start(await getEnvironmentSummary(environmentId)).finally(() => (done = true))
}

// TODO: move to shared file
function parseIdFromArn(arn: string) {
    return arn.split('/').pop()
}

async function getEnvironmentSummary(id: string): Promise<GetEnvironmentMetadataResponse & { connected: boolean }> {
    const envClient = new RemoteEnvironmentClient()
    const summary = await globals.mde.getEnvironmentMetadata({ environmentId: id })
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
        await fetcher.get().then(content => {
            return vscode.workspace.openTextDocument({ language: 'yaml', content })
        })
    } else if (uri.scheme === 'file') {
        if (uri.authority !== '') {
            const basePath = vscode.workspace.workspaceFolders?.[0].uri.path ?? ''
            const relative = uri
                .toString()
                .replace('file://', '')
                .split('/')
                .filter(p => p)
            const absolute = vscode.Uri.file(path.resolve(basePath, ...relative))
            await vscode.window.showTextDocument(absolute)
        } else {
            await vscode.window.showTextDocument(uri)
        }
    }
}

async function toggleMdeState(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'status'> & { connected?: boolean }) {
    if (mde.status === 'RUNNING') {
        if (mde.connected && checkUnsavedChanges()) {
            // TODO: show confirmation prompt instead?
            vscode.window.showErrorMessage('Cannot stop current environment with unsaved changes')
            throw new Error('Cannot stop environment with unsaved changes')
        }
        return globals.mde.stopEnvironment({ environmentId: mde.id })
    } else if (mde.status === 'STOPPED') {
        return globals.mde.startEnvironment({ environmentId: mde.id })
    } else {
        throw new Error('Environment is still in a pending state')
    }
}

async function updateDevfile(location: string): Promise<void> {
    const client = new RemoteEnvironmentClient()
    await client.startDevfile({ location })
    // TODO: start polling? restart the MDE?
}

// Poll a prop until it changes
async function pollStatus<T, K extends keyof T>(prop: K, target: T[K], provider: () => Promise<T>): Promise<void> {
    while (true) {
        const next = await provider()
        if (next[prop] === target) {
            break
        }
        await sleep(10000)
    }
}

async function pollDelete(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'status'>) {
    const provider = () =>
        globals.mde
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

    await pollStatus('status', 'DELETED', provider)
}

// Easier to compute the object diff here than on the frontend, although it requires one extra API call
async function computeTagDiff(arn: string, tags: Record<string, string>): Promise<Record<string, string | undefined>> {
    const environmentId = parseIdFromArn(arn)
    if (!environmentId) {
        throw new Error('Could not parse environment id from arn')
    }

    const env = await globals.mde.getEnvironmentMetadata({ environmentId })
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
        deletedTags.length > 0 ? globals.mde.untagResource(arn, deletedTags) : Promise.resolve(),
        Object.keys(filteredTags).length > 0 ? globals.mde.tagResource(arn, filteredTags) : Promise.resolve(),
    ])
}
