/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { RemoteSource, RemoteSourceProvider } from '../../../types/git'
import { promptCawsNotConnected } from '../utils'
import { CawsAuthenticationProvider } from '../auth'
import { createRepoLabel } from '../wizards/selectResource'
import { createClientFactory, toCawsGitUri } from '../model'

export class CawsRemoteSourceProvider implements RemoteSourceProvider {
    public readonly icon = 'git-merge' // TODO: find a correct icon. I don't think we can provide a custom one...
    public readonly supportsQuery = false // TODO(sijaden): implement query

    public constructor(private readonly authProvider: CawsAuthenticationProvider) {}

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
        const client = await createClientFactory(this.authProvider)()

        if (!client.connected) {
            promptCawsNotConnected()
            return
        }

        const repos: RemoteSource[] = []
        const repositoryIter = client.listResources('repo').flatten()

        for await (const repo of repositoryIter) {
            const resource = { name: repo.name, project: repo.project.name, org: repo.org.name }
            const pat = await this.authProvider.getPat(client)
            const cloneUrl = toCawsGitUri(client.identity.name, pat, resource)

            repos.push({
                name: createRepoLabel(repo),
                url: cloneUrl,
                description: repo.description,
            })
        }

        return repos
    }
}
