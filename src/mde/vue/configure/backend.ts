/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { ExtContext } from '../../../shared/extensions'
import * as nls from 'vscode-nls'
import { EnvironmentSettingsWizard, getAllInstanceDescriptions, SettingsForm } from '../../wizards/environmentSettings'
import { GetEnvironmentMetadataResponse } from '../../../../types/clientmde'
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
import { VueWebview } from '../../../webviews/main'

const localize = nls.loadMessageBundle()
export interface DefinitionTemplate {
    name: string
    source: string
}

export class MdeConfigureWebview extends VueWebview {
    public readonly id = 'configureMde'
    public readonly source = 'src/mde/vue/configure/index.js'
    public readonly onEnvironmentUpdate = new vscode.EventEmitter<
        GetEnvironmentMetadataResponse & { connected: boolean }
    >()
    public readonly onDevfileUpdate = new vscode.EventEmitter<GetStatusResponse & { actionId: 'devfile' }>()

    public constructor(
        private readonly summary: Awaited<ReturnType<typeof getEnvironmentSummary>>,
        private readonly envClient: RemoteEnvironmentClient
    ) {
        super()
    }

    public init() {
        return this.summary
    }

    public async editSettings(data: SettingsForm, type?: 'create' | 'configure') {
        const settingsWizard = new EnvironmentSettingsWizard(data, type)
        const response = await settingsWizard.run()

        return response
    }

    public async loadTemplates() {
        return getRegistryDevFiles().then(t =>
            t.map(name => ({
                name,
                source: PUBLIC_REGISTRY_URI.with({ path: `devfiles/${name}` }).toString(),
            }))
        )
    }

    public async openDevfile(uri: string | vscode.Uri) {
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

    public getAllInstanceDescriptions() {
        return getAllInstanceDescriptions()
    }

    public async toggleMdeState(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'status'> & { connected?: boolean }) {
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

    public async updateDevfile(location: string): Promise<void> {
        await this.envClient.startDevfile({ location })
        // TODO: start polling? restart the MDE?
    }

    public updateTags(arn: string, tags: Record<string, string>) {
        return computeTagDiff(arn, tags).then(diff => updateTags(arn, diff))
    }

    public async startDevfile(location: string) {
        if (!this.envClient.arn) {
            throw new Error('Cannot start devfile when not in environment')
        }
        return tryRestart(this.envClient.arn, async () => {
            await this.envClient.startDevfile({ location, recreateHomeVolumes: true })
        })
    }

    public async restartEnvironment(mde: Pick<GetEnvironmentMetadataResponse, 'id' | 'arn'>) {
        return tryRestart(mde.arn, async () => {
            await globals.mde.stopEnvironment({ environmentId: mde.id })
        })
    }

    public getEnvironmentSummary() {
        return getEnvironmentSummary.bind(undefined, this.summary.id)
    }

    public async deleteEnvironment(mde: GetEnvironmentMetadataResponse) {
        const deleted = await mdeDeleteCommand(mde)
        if (!deleted) {
            return
        }
        pollDelete(mde).then(() => {
            this.onEnvironmentUpdate.fire({ ...mde, status: 'DELETED', connected: false })
        })
        return deleted
    }

    public connect() {
        return mdeConnectCommand(this.summary, parse(this.summary.arn).region)
    }
}

const Panel = VueWebview.compilePanel(MdeConfigureWebview)

export async function createMdeConfigureWebview(context: ExtContext, id?: string): Promise<void> {
    const envClient = new RemoteEnvironmentClient()
    const environmentId = id ?? parseIdFromArn(envClient.arn ?? '')
    if (!environmentId) {
        throw new Error('Unable to resolve id for MDE environment')
    }

    const summary = await getEnvironmentSummary(environmentId)
    const webview = new Panel(context.extensionContext, summary, envClient)
    const panel = await webview.show({
        title: localize('AWS.command.configureMdeForm.title', 'Environment settings'),
        viewColumn: vscode.ViewColumn.Active,
    })

    let done: boolean | undefined
    panel.onDidDispose(() => (done = true))

    // Poll for devfile status changes
    const DEVFILE_POLL_RATE = 1000
    ;(async function () {
        while (!done) {
            const resp = await new RemoteEnvironmentClient().getStatus()
            getLogger().debug('poll for environment status')
            if (resp.status === 'CHANGED') {
                webview.server.onDevfileUpdate.fire({ ...resp, actionId: 'devfile' })
            }
            await sleep(DEVFILE_POLL_RATE)
        }
    })()
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
