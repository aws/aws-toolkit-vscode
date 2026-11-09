/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getAwsConsoleUrl } from '../../awsConsole'
import { DefaultEcrClient } from '../../clients/ecrClient'
import { samSyncUrl } from '../../constants'
import { createCommonButtons } from '../buttons'
import { createQuickPick } from '../pickerPrompter'

import * as nls from 'vscode-nls'
import { getRecentResponse } from '../../sam/utils'

export const localize = nls.loadMessageBundle()
export const prefixNewRepoName = (name: string) => `newrepo:${name}`

/**
 * Creates a quick pick prompter for ECR repositories
 * The prompter supports choosing from existing option and new repositories by entering a name
 *
 * @param client ECR client used to list repositories
 * @param mementoRootKey Key used to store/retrieve recently used repository (e.g 'samcli.deploy.params')
 * @returns A quick pick prompter configured for ECR repository
 */
export function createEcrPrompter(client: DefaultEcrClient, mementoRootKey: string) {
    const recentEcrRepo = getRecentResponse(mementoRootKey, client.regionCode, 'ecrRepoUri')
    const consoleUrl = getAwsConsoleUrl('ecr', client.regionCode)
    const items = client.listAllRepositories().map((list) =>
        list.map((repo) => ({
            label: repo.repositoryName,
            data: repo.repositoryUri,
            detail: repo.repositoryArn,
            recentlyUsed: repo.repositoryUri === recentEcrRepo,
        }))
    )

    return createQuickPick(items, {
        title: 'Select an ECR Repository',
        placeholder: 'Select a repository (or enter a name to create one)',
        buttons: createCommonButtons(samSyncUrl, consoleUrl),
        filterBoxInputSettings: {
            label: 'Create a New Repository',
            transform: (v) => prefixNewRepoName(v),
        },
        noItemsFoundItem: {
            label: localize(
                'aws.ecr.noRepos',
                'No ECR repositories in region "{0}". Enter a name to create a new one.',
                client.regionCode
            ),
            data: undefined,
            onClick: undefined,
        },
    })
}
