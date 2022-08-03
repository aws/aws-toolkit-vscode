/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { RemoteSource, RemoteSourceProvider } from '../../../types/git'
import { CawsAuthenticationProvider } from '../auth'
import { createRepoLabel } from '../wizards/selectResource'
import { toCawsGitUri } from '../model'
import { CawsCommands } from '../commands'
import { CawsRepo } from '../../shared/clients/cawsClient'

function showQuickPickLoadingBar<T>(title: string, task: () => Promise<T>): Promise<T> {
    const picker = vscode.window.createQuickPick()
    picker.placeholder = title
    picker.busy = true
    picker.enabled = false
    picker.ignoreFocusOut = true
    picker.show()

    return task().finally(() => picker.hide())
}

export class CawsRemoteSourceProvider implements RemoteSourceProvider {
    public readonly icon = 'git-merge' // TODO: find a correct icon. I don't think we can provide a custom one...
    public readonly supportsQuery = false // TODO(sijaden): implement query

    public constructor(
        private readonly commands: Pick<CawsCommands, 'withClient'>,
        private readonly authProvider: Pick<CawsAuthenticationProvider, 'getPat' | 'getActiveSession'>
    ) {}

    public get name(): string {
        const username = this.authProvider.getActiveSession()?.accountDetails.label

        return localize(
            'AWS.caws.cloneRepo.git',
            'REMOVED.codes {0}',
            username
                ? localize('AWS.caws.cloneRepo.connected', '(connected as {0})', username)
                : localize('AWS.credentials.statusbar.no.credentials', '(not connected)')
        )
    }

    public async getRemoteSources(query?: string): Promise<RemoteSource[] | undefined> {
        return this.commands.withClient(async client => {
            const intoRemote = async (repo: CawsRepo): Promise<RemoteSource> => {
                const resource = { name: repo.name, project: repo.project.name, org: repo.org.name }
                const pat = await this.authProvider.getPat(client)
                const cloneUrl = toCawsGitUri(client.identity.name, pat, resource)

                return {
                    name: createRepoLabel(repo),
                    url: cloneUrl,
                    description: repo.description,
                }
            }

            return showQuickPickLoadingBar('Repository name', () =>
                client.listResources('repo').flatten().map(intoRemote).promise()
            )
        })
    }
}
