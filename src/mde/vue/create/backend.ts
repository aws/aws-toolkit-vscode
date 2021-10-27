/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IAM } from 'aws-sdk'
import { ExtContext } from '../../../shared/extensions'
import { compileVueWebview } from '../../../webviews/main'
import * as nls from 'vscode-nls'
import * as mdeModel from '../../mdeModel'
import { ext } from '../../../shared/extensionGlobals'
import { EnvironmentSettingsWizard, getAllInstanceDescriptions, SettingsForm } from '../../wizards/environmentSettings'
import { CreateEnvironmentRequest } from '../../../../types/clientmde'
import { getDevFiles, getRegistryDevFiles, promptDevFiles, PUBLIC_REGISTRY_URI } from '../../wizards/devfiles'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { GitExtension } from '../../../shared/extensions/git'
import { MdeEnvironment } from '../../../shared/clients/mdeClient'
import { VSCODE_MDE_TAGS } from '../../constants'
import { productName } from '../../../shared/constants'
const localize = nls.loadMessageBundle()

export interface DefinitionTemplate {
    name: string
    source: string
}

const VueWebview = compileVueWebview({
    id: 'createMde',
    cssFiles: ['base.css'],
    name: localize('AWS.command.createMdeForm.title', 'Create new development environment'),
    webviewJs: 'createMdeVue.js',
    viewColumn: vscode.ViewColumn.Active,
    validateData: (repo?: { url: string; branch?: string }) => true,
    validateSubmit: async (result: CreateEnvironmentRequest) => {
        return await submit(result)
    },
    commands: {
        loadRoles,
        cancel() {
            this.dispose()
        },
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
        listBranches,
    },
})

export class MdeCreateWebview extends VueWebview {}

export async function createMdeWebview(
    context: ExtContext,
    repo?: { url: string; branch?: string }
): Promise<MdeEnvironment | undefined> {
    return new MdeCreateWebview(context).show(repo)
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

// This currently mutates the argument.
// TODO: don't mutate it, put this logic somewhere else
async function submit(data: CreateEnvironmentRequest) {
    if (data.sourceCode?.[0]?.uri) {
        const target = data.sourceCode[0]
        // a URI always needs a scheme, but git parses things differently if you drop the scheme
        // so for now we will make sure the scheme exists, but give git the scheme-less version
        if (vscode.Uri.parse(target.uri).scheme === '') {
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

// TODO: make this more robust by parsing the document then checking principals
// TODO: check 'Action' to see that the role can be assumed
const MDE_SERVICE_PRINCIPAL = 'moontide'

async function loadRoles(): Promise<IAM.Role[]> {
    const client = ext.toolkitClientBuilder.createIamClient('us-east-1') // hard-coded region for now

    // Not paginated
    try {
        return (await client.listRoles()).filter(r => r.AssumeRolePolicyDocument?.includes(MDE_SERVICE_PRINCIPAL))
    } catch (err) {
        vscode.window.showErrorMessage((err as Error).message)
        return []
    }
}

async function openDevfile(url: string | vscode.Uri) {
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

async function listBranches(url: string) {
    const git = GitExtension.instance
    const targetNoSsh = url.startsWith('ssh://') ? url.slice(6) : url
    const branches = await git.getBranchesForRemote({ name: 'User Input', fetchUrl: targetNoSsh, isReadOnly: true })
    return branches.filter(b => b.name !== undefined).map(b => b.name?.split('/').slice(1).join('/')) as string[]
}

/**
 * This will live here for now to stop circular depedencies
 * But realistically it should belong somewhere else.
 */
async function createMdeWithTags(request: CreateEnvironmentRequest): Promise<MdeEnvironment | undefined> {
    const mdeClient = ext.mde

    const repo = request?.sourceCode
    // We will always perform the clone
    delete request?.sourceCode

    const defaultTags = {
        [VSCODE_MDE_TAGS.tool]: productName,
    }
    if (repo && repo[0]) {
        defaultTags[VSCODE_MDE_TAGS.repository] = repo[0].uri
        defaultTags[VSCODE_MDE_TAGS.repositoryBranch] = repo[0].branch ?? 'master' // TODO: better fallback?
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

    return env
}
