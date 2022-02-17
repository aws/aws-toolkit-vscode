/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { GitExtension, RemoteSource, RemoteSourceProvider } from '../../../types/git'
import { CawsRepo } from '../../shared/clients/cawsClient'
import { promptCawsNotConnected } from '../utils'

import * as nls from 'vscode-nls'
import globals from '../../shared/extensionGlobals'
const localize = nls.loadMessageBundle()

export class CawsRemoteSourceProvider implements RemoteSourceProvider {
    public readonly name: string
    public readonly icon = 'git-merge' // TODO: find a correct icon. I don't think we can provide a custom one...
    private readonly repoUrls: Map<string, CawsRepo>

    public constructor(private readonly uname?: string) {
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
        const repos: RemoteSource[] = []
        if (!globals.caws.connected()) {
            promptCawsNotConnected()
        } else {
            const repositoryIter = globals.caws.listRepos(globals.caws.user())

            for await (const repo of repositoryIter) {
                const cloneUrl = await globals.caws.toCawsGitUri(repo.org.name, repo.project.name, repo.name)
                const url = globals.caws.toCawsUrl(repo)
                repos.push({
                    name: globals.caws.createRepoLabel(repo),
                    url: cloneUrl,
                    description: repo.description,
                })
                this.repoUrls.set(url, repo)
            }
        }

        return repos
    }
}

export function initCurrentRemoteSourceProvider(extension: vscode.Extension<GitExtension>): void {
    let currDisposable: vscode.Disposable | undefined

    // TODO: Add user initialization outside git extension activation
    let initialUser: string | undefined
    try {
        initialUser = globals.caws.user()
    } catch {
        // swallow error: no user set
    }
    currDisposable = makeNewRemoteSourceProvider(extension, initialUser)

    globals.context.subscriptions.push(
        globals.awsContext.onDidChangeContext(c => {
            if (currDisposable) {
                currDisposable.dispose()
            }
            if (c.cawsUsername && c.cawsSecret) {
                currDisposable = makeNewRemoteSourceProvider(extension, c.cawsUsername)
            } else {
                currDisposable = makeNewRemoteSourceProvider(extension)
            }
        })
    )
}

function makeNewRemoteSourceProvider(extension: vscode.Extension<GitExtension>, uname?: string): vscode.Disposable {
    const API_VERSION = 1
    const API = extension.exports.getAPI(API_VERSION)
    return API.registerRemoteSourceProvider(new CawsRemoteSourceProvider(uname))
}
