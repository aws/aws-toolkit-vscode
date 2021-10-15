/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as GitTypes from '../../../types/git.d'
import { GitExtension } from '../../shared/extensions/git'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { createBackButton } from '../../shared/ui/buttons'

import * as nls from 'vscode-nls'
import { isValidResponse } from '../../shared/wizards/wizard'
import { getLogger } from '../../shared/logger/logger'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DevfileConfiguration } from '../../../types/clientmde'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
const localize = nls.loadMessageBundle()

// may be useful, need lib or write code to change glob to regex
// import { DEVFILE_GLOB_PATTERN } from '../../shared/fs/devfileRegistry'

type RemoteWithBranch = Omit<GitTypes.Remote, 'isReadOnly'> & {
    fetchUrl: string
    branch?: string
}

const PUBLIC_REGISTRY_URI = vscode.Uri.parse('https://registry.devfile.io')

async function getDevFiles(remote: RemoteWithBranch): Promise<string[]> {
    // TODO: pipe `GitExtension` through for testing purposes
    const git = new GitExtension()
    const result = await git.listAllRemoteFiles(remote)

    const devFiles = result.files.map(f => f.name).filter(f => f.match(/^(.*[\/\\])?devfile.(yaml|yml)$/))
    result.dispose()

    return devFiles
}

export async function getRegistryDevFiles(registry: vscode.Uri): Promise<string[]> {
    const index = await new HttpResourceFetcher(registry.with({ path: 'index' }).toString(), { showUrl: true }).get()

    if (index === undefined) {
        throw new Error(`Failed to get dev files from "${registry}"`)
    }

    return Array.from(JSON.parse(index)).map(f => (f as any).name)
}

export async function promptDevFiles(remote?: RemoteWithBranch): Promise<DevfileConfiguration | undefined> {
    // TODO: add an option to 'prompter' to auto-return when there's only one option
    // may need to add a small amount of logic to the wizard flow to remove the prompt from the step-count

    // fill with options from the public registry

    const options: DataQuickPickItem<DevfileConfiguration>[] = (await getRegistryDevFiles(PUBLIC_REGISTRY_URI)).map(
        name => ({
            label: name,
            description: PUBLIC_REGISTRY_URI.toString(),
            data: { uri: { uri: PUBLIC_REGISTRY_URI.with({ path: `devfiles/${name}` }).toString() } },
        })
    )

    if (remote) {
        const remoteFiles = await getDevFiles(remote).catch(err => {
            // TODO: is an error item better or a toast? error item may be too subtle
            getLogger().error(`mde devfiles: failed to retrieve files from remote: ${err}`)
            showViewLogsMessage(localize('aws.mde.devfile.prompt.failed', 'No devfiles could be found'))
            return []
        })
        remoteFiles
            .map(name => ({
                label: name,
                description: remote.fetchUrl,
                data: { filesystem: { path: name } },
            }))
            .forEach(f => options.push(f))
    }

    const response = await createQuickPick(options, {
        title: localize('AWS.mde.devfile.prompt.title', 'Choose a devfile'),
        buttons: [createBackButton()],
    }).prompt()

    return isValidResponse(response) ? response : undefined
}
