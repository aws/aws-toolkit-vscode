/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { RemoteSource, RemoteSourceProvider } from '../../../../../types/git'
import { CodeCatalystAuthenticationProvider } from '../auth'
import { createRepoLabel } from '../wizards/selectResource'
import { CodeCatalystCommands } from '../commands'
import { CodeCatalystRepo } from '../../shared/clients/codecatalystClient'
import { getIcon, Icon } from '../../shared/icons'

function showQuickPickLoadingBar<T>(title: string, task: () => Promise<T>): Promise<T> {
    const picker = vscode.window.createQuickPick()
    picker.show() // `show` must happen first on C9 before assigning fields
    picker.placeholder = title
    picker.busy = true
    picker.enabled = false
    picker.ignoreFocusOut = true

    return task().finally(() => picker.hide())
}

export class CodeCatalystRemoteSourceProvider implements RemoteSourceProvider {
    public readonly supportsQuery = false // TODO(sijaden): implement query

    public constructor(
        private readonly commands: Pick<CodeCatalystCommands, 'withClient'>,
        private readonly authProvider: Pick<CodeCatalystAuthenticationProvider, 'getPat' | 'activeConnection'>
    ) {}

    // Must be a `codicon` id
    public get icon() {
        const icon = getIcon('aws-codecatalyst-logo')

        return icon instanceof Icon ? icon.id : undefined
    }

    public get name(): string {
        const username = this.authProvider.activeConnection?.label

        return localize(
            'AWS.codecatalyst.cloneRepo.git',
            'Amazon CodeCatalyst {0}',
            username
                ? localize('AWS.codecatalyst.cloneRepo.connected', '(connected with {0})', username)
                : localize('AWS.credentials.statusbar.no.credentials', '(not connected)')
        )
    }

    public async getRemoteSources(query?: string): Promise<RemoteSource[] | undefined> {
        return this.commands.withClient(async client => {
            const intoRemote = async (repo: CodeCatalystRepo): Promise<RemoteSource> => {
                const resource = { name: repo.name, project: repo.project.name, org: repo.org.name }
                const url = await client.getRepoCloneUrl({
                    spaceName: resource.org,
                    projectName: resource.project,
                    sourceRepositoryName: resource.name,
                })

                return {
                    name: createRepoLabel(repo),
                    url: url,
                    description: repo.description,
                }
            }

            return showQuickPickLoadingBar('Repository name', () =>
                client.listResources('repo').flatten().map(intoRemote).promise()
            )
        })
    }
}
