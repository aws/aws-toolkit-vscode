/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RemoteSource, RemoteSourceProvider } from '../../../types/git'
import { CawsClient, CawsClientFactory, CawsRepo } from '../../shared/clients/cawsClient'
import { promptCawsNotConnected, toCawsUrl } from '../utils'

import * as nls from 'vscode-nls'
import globals from '../../shared/extensionGlobals'
import { GitExtension } from '../../shared/extensions/git'
import { CawsAuthenticationProvider } from '../auth'
const localize = nls.loadMessageBundle()

export class CawsRemoteSourceProvider implements RemoteSourceProvider {
    public readonly name: string
    public readonly icon = 'git-merge' // TODO: find a correct icon. I don't think we can provide a custom one...
    private readonly repoUrls: Map<string, CawsRepo>

    public constructor(private readonly client: CawsClient, private readonly uname?: string) {
        this.repoUrls = new Map<string, CawsRepo>()
        this.name = localize(
            'AWS.caws.cloneRepo.git',
            'CODE.AWS {0}',
            this.uname
                ? localize('AWS.caws.cloneRepo.connected', '(connected as {0})', this.uname)
                : localize('AWS.credentials.statusbar.no.credentials', '(not connected)')
        )
    }

    public async getRemoteSources(query?: string): Promise<RemoteSource[] | undefined> {
        if (!this.client.connected) {
            promptCawsNotConnected()
            return
        }

        const repos: RemoteSource[] = []
        const repositoryIter = this.client.listResources('repo').flatten()

        for await (const repo of repositoryIter) {
            const cloneUrl = await this.client.toCawsGitUri(repo.org.name, repo.project.name, repo.name)
            const url = toCawsUrl(repo)
            repos.push({
                name: this.client.createRepoLabel(repo),
                url: cloneUrl,
                description: repo.description,
            })
            this.repoUrls.set(url, repo)
        }

        return repos
    }
}

export async function initCurrentRemoteSourceProvider(
    factory: CawsClientFactory,
    extension: GitExtension
): Promise<void> {
    const authProvider = CawsAuthenticationProvider.getInstance()
    let currDisposable: Promise<vscode.Disposable> | undefined

    // TODO: Add user initialization outside git extension activation
    const initialUser = await factory().then(c => (c.connected ? c.user() : undefined))
    const createSourceProvider = async (uname?: string) =>
        extension.registerRemoteSourceProvider(new CawsRemoteSourceProvider(await factory(), uname))

    currDisposable = createSourceProvider(initialUser)

    globals.context.subscriptions.push(
        authProvider.onDidChangeSessions(e => {
            const session = authProvider.listSessions()[0]

            currDisposable?.then(d => d.dispose())
            currDisposable = createSourceProvider(session?.accountDetails.label)
        })
    )
}
