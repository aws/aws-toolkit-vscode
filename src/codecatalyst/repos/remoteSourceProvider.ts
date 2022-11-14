/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { RemoteSource, RemoteSourceProvider } from '../../../types/git'
import { CodeCatalystAuthenticationProvider } from '../auth'
import { createRepoLabel } from '../wizards/selectResource'
import { getRepoCloneUrl } from '../model'
import { CodeCatalystCommands } from '../commands'
import { CodeCatalystRepo } from '../../shared/clients/codecatalystClient'

function showQuickPickLoadingBar<T>(title: string, task: () => Promise<T>): Promise<T> {
    const picker = vscode.window.createQuickPick()
    picker.placeholder = title
    picker.busy = true
    picker.enabled = false
    picker.ignoreFocusOut = true
    picker.show()

    return task().finally(() => picker.hide())
}

export class CodeCatalystRemoteSourceProvider implements RemoteSourceProvider {
    public readonly icon = 'git-merge' // TODO: find a correct icon. I don't think we can provide a custom one...
    public readonly supportsQuery = false // TODO(sijaden): implement query

    public constructor(
        private readonly commands: Pick<CodeCatalystCommands, 'withClient'>,
        private readonly authProvider: Pick<CodeCatalystAuthenticationProvider, 'getPat' | 'activeConnection'>
    ) {}

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
                const pat = await this.authProvider.getPat(client)
                const url = await getRepoCloneUrl(
                    client,
                    {
                        spaceName: resource.org,
                        projectName: resource.project,
                        sourceRepositoryName: resource.name,
                    },
                    client.identity.name,
                    pat
                )

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
