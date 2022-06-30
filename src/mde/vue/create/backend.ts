/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IAM } from 'aws-sdk'
import { ExtContext } from '../../../shared/extensions'
import * as nls from 'vscode-nls'
import * as mdeModel from '../../mdeModel'
import { EnvironmentSettingsWizard, getAllInstanceDescriptions, SettingsForm } from '../../wizards/environmentSettings'
import { CreateEnvironmentRequest } from '../../../../types/clientmde'
import { getDevFiles, getRegistryDevFiles, promptDevFiles, PUBLIC_REGISTRY_URI } from '../../wizards/devfiles'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { GitExtension } from '../../../shared/extensions/git'
import { MdeClient, MdeEnvironment } from '../../../shared/clients/mdeClient'
import { VSCODE_MDE_TAGS } from '../../constants'
import { productName } from '../../../shared/constants'
import { cloneToMde } from '../../mdeCommands'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'

const localize = nls.loadMessageBundle()

// TODO: make this more robust by parsing the document then checking principals
// TODO: check 'Action' to see that the role can be assumed
const MDE_SERVICE_PRINCIPAL = 'moontide'
export interface DefinitionTemplate {
    name: string
    source: string
}

export class MdeCreateWebview extends VueWebview {
    public readonly id = 'createMde'
    public readonly source = 'src/mde/vue/create/index.js'
    private environment?: MdeEnvironment

    public constructor(private readonly repo?: { url: string; branch?: string }) {
        super()
    }

    public get submitResult() {
        return this.environment
    }

    public init() {
        return this.repo
    }

    public async submit(request: CreateEnvironmentRequest) {
        const env = await submit(request)
        this.environment = env
        this.dispose()

        return env
    }

    public async loadRoles(): Promise<IAM.Role[]> {
        const client = globals.toolkitClientBuilder.createIamClient('us-east-1') // hard-coded region for now

        // Not paginated
        try {
            return (await client.listRoles()).filter(r => r.AssumeRolePolicyDocument?.includes(MDE_SERVICE_PRINCIPAL))
        } catch (err) {
            vscode.window.showErrorMessage((err as Error).message)
            return []
        }
    }

    public cancel() {
        this.dispose()
    }

    public async editSettings(data: SettingsForm) {
        const settingsWizard = new EnvironmentSettingsWizard(data)
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

    public async openDevfile(url: string | vscode.Uri) {
        url = typeof url === 'string' ? vscode.Uri.parse(url, true) : url
        if (url.scheme === 'http' || url.scheme === 'https') {
            const fetcher = new HttpResourceFetcher(url.toString(), { showUrl: true })
            fetcher.get().then(content => {
                vscode.workspace.openTextDocument({ language: 'yaml', content })
            })
        } else if (url.scheme === 'file') {
            vscode.workspace.openTextDocument(url)
        }
    }

    public getAllInstanceDescriptions() {
        return getAllInstanceDescriptions()
    }

    public async listBranches(url: string) {
        const git = GitExtension.instance
        const targetNoSsh = url.startsWith('ssh://') ? url.slice(6) : url
        const branches = await git.getBranchesForRemote({ name: 'User Input', fetchUrl: targetNoSsh, isReadOnly: true })
        return branches.filter(b => b.name !== undefined).map(b => b.name?.split('/').slice(1).join('/')) as string[]
    }
}

const Panel = VueWebview.compilePanel(MdeCreateWebview)

export async function createMdeWebview(
    context: ExtContext,
    repo?: { url: string; branch?: string }
): Promise<MdeEnvironment | undefined> {
    const webview = new Panel(context.extensionContext, repo)
    const panel = await webview.show({
        title: localize('AWS.command.createMdeForm.title', 'Create new development environment'),
        viewColumn: vscode.ViewColumn.Active,
    })

    return new Promise<MdeEnvironment | undefined>(resolve => {
        panel.onDidDispose(() => resolve(webview.server.submitResult))
    })
}

// This currently mutates the argument.
// TODO: don't mutate it, put this logic somewhere else
async function submit(data: CreateEnvironmentRequest) {
    if (data.sourceCode?.[0]?.uri) {
        const target = data.sourceCode[0]
        // a URI always needs a scheme, but git parses things differently if you drop the scheme
        // so for now we will make sure the scheme exists, but give git the scheme-less version
        // Temporary for now
        if (!target.uri.match(/^[\w]+:/)) {
            target.uri = `ssh://${target.uri}`
        }

        // TODO: remove this or have the git extension wrapper do it
        const targetNoSsh = target.uri.startsWith('ssh') ? target.uri.slice(6) : target.uri

        const devFiles = await getDevFiles({ name: 'origin', fetchUrl: targetNoSsh, branch: target.branch }).catch(
            () => {
                // swallow the error since prompting for devfiles is currently out-of-scope
                // later on we can refine this (display the error)
                return []
            }
        )

        const file =
            devFiles.length > 1
                ? await promptDevFiles({ name: 'origin', fetchUrl: targetNoSsh, branch: target.branch })
                : {
                      filesystem: { path: devFiles[0] },
                  }
        if (!file) {
            throw new Error('User cancelled devfile prompt')
        }
        data.devfile ??= devFiles.length > 0 ? file : undefined
    } else {
        delete data.sourceCode
    }
    // Empty strings are not automatically stripped out
    if (data.devfile?.uri?.uri === '') {
        delete data.devfile
    }

    return createMdeWithTags(data)
}

/**
 * This will live here for now to stop circular depedencies
 * But realistically it should belong somewhere else.
 */
async function createMdeWithTags(request: CreateEnvironmentRequest): Promise<MdeEnvironment | undefined> {
    const mdeClient = await MdeClient.create()

    const repo = request?.sourceCode?.[0]
    // We will always perform the clone
    delete request?.sourceCode

    const defaultTags = {
        [VSCODE_MDE_TAGS.tool]: productName,
    }
    if (repo) {
        defaultTags[VSCODE_MDE_TAGS.repository] = repo.uri
        defaultTags[VSCODE_MDE_TAGS.repositoryBranch] = repo.branch ?? 'master' // TODO: better fallback?
    }
    const emailHash = await mdeModel.getEmailHash()
    if (emailHash) {
        defaultTags[VSCODE_MDE_TAGS.email] = emailHash
    }
    const env = await mdeClient.createEnvironment({
        ...request,
        tags: {
            ...defaultTags,
            ...(request?.tags ?? {}),
        },
    })

    if (env && repo) {
        // TODO: this can be moved somewhere else, but the webview needs to expose more information
        ;(async function () {
            try {
                const repoUri = vscode.Uri.parse(repo.uri, true)
                const runningEnv = await mdeClient.startEnvironmentWithProgress(env)
                if (!runningEnv) {
                    throw new Error('Environment should not be undefined')
                }
                if (request.devfile) {
                    await mdeClient.waitForDevfile(runningEnv)
                    // XXX: most devfiles specify mounting the 'project' directory, not 'projects'
                    await cloneToMde(runningEnv, { ...repo, uri: repoUri }, '/project')
                } else {
                    await cloneToMde(runningEnv, { ...repo, uri: repoUri })
                }
            } catch (err) {
                showViewLogsMessage(
                    localize(
                        'AWS.command.createMde.clone.failed',
                        'Failed to clone repository to environment: {0}',
                        (err as Error).message
                    )
                )
            }
        })()
    }

    return env
}
