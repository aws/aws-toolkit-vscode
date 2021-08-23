/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteSource, RemoteSourceProvider } from '../../../types/git'
import { CawsRepo } from '../../shared/clients/cawsClient'
import { ext } from '../../shared/extensionGlobals'
import { promptCawsNotConnected } from '../utils'

import * as nls from 'vscode-nls'
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
        if (!ext.caws.connected()) {
            promptCawsNotConnected()
        } else {
            const repositoryIter = ext.caws.listRepos(ext.caws.user())

            for await (const repo of repositoryIter) {
                const cloneUrl = await ext.caws.toCawsGitCloneLink(repo)
                const url = ext.caws.toCawsUrl(repo)
                repos.push({
                    name: ext.caws.createRepoLabel(repo),
                    url: cloneUrl,
                    description: repo.description,
                })
                this.repoUrls.set(url, repo)
            }
        }

        return repos
    }

    // TODO: Is this ever used? Not used in the clone workflow.
    // public async getBranches(url: string): Promise<string[]> {
    //     const branches: string[] = []
    //     const repo = this.repoUrls.get(url)
    //     if (repo) {
    //         const branchesIter = ext.caws.listBranchesForRepo(repo)

    //         for await (const branchOutput of branchesIter) {
    //             if (!branchOutput) {
    //                 break
    //             }
    //             branchOutput.items!.forEach(branch => {
    //                 branches.push(branch.branchName || '')
    //             })
    //         }
    //     }

    //     return branches
    // }
}
