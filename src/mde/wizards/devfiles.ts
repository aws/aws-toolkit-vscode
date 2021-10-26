/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as GitTypes from '../../../types/git'
import { GitExtension } from '../../shared/extensions/git'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { createBackButton } from '../../shared/ui/buttons'

import * as nls from 'vscode-nls'
import { isValidResponse } from '../../shared/wizards/wizard'
import { DevfileConfiguration } from '../../../types/clientmde'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
const localize = nls.loadMessageBundle()

// may be useful, need lib or write code to change glob to regex
// import { DEVFILE_GLOB_PATTERN } from '../../shared/fs/devfileRegistry'

type RemoteWithBranch = Omit<GitTypes.Remote, 'isReadOnly'> & {
    fetchUrl: string
    branch?: string
}

export const PUBLIC_REGISTRY_URI = vscode.Uri.parse('https://registry.devfile.io')

export async function getDevFiles(remote: RemoteWithBranch): Promise<string[]> {
    const git = GitExtension.instance
    const result = await git.listAllRemoteFiles(remote)

    const devFiles = result.files.map(f => f.name).filter(f => f.match(/^(.*[\/\\])?devfile.(yaml|yml)$/))
    result.dispose()

    return devFiles
}

export async function getRegistryDevFiles(registry: vscode.Uri = PUBLIC_REGISTRY_URI): Promise<string[]> {
    const index = await new HttpResourceFetcher(registry.with({ path: 'index' }).toString(), { showUrl: true }).get()

    if (index === undefined) {
        throw new Error(`Failed to get dev files from "${registry}"`)
    }

    return Array.from(JSON.parse(index)).map(f => (f as any).name)
}

export async function promptDevFiles(remote: RemoteWithBranch): Promise<DevfileConfiguration | undefined> {
    const items = getDevFiles(remote).then(files =>
        files.map(name => ({
            label: name,
            description: remote.fetchUrl,
            data: { filesystem: { path: name } },
        }))
    )

    const response = await createQuickPick(items, {
        title: localize('AWS.mde.devfile.prompt.title', 'Choose a devfile'),
        buttons: [createBackButton()],
    }).prompt()

    return isValidResponse(response) ? response : undefined
}
