/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as caws from '../../shared/clients/cawsClient'
import { createCommonButtons, createRefreshButton } from '../../shared/ui/buttons'
import {
    createQuickPick,
    DataQuickPickItem,
    ExtendedQuickPickOptions,
    QuickPickPrompter,
} from '../../shared/ui/pickerPrompter'
import { AsyncCollection } from '../../shared/utilities/asyncCollection'
import { getRelativeDate } from '../../shared/utilities/textUtilities'
import { isValidResponse } from '../../shared/wizards/wizard'
import { associateWorkspace } from '../model'
import { getHelpUrl } from '../utils'

export function createRepoLabel(r: caws.CawsRepo): string {
    return `${r.org.name} / ${r.project.name} / ${r.name}`
}

/**
 * Maps CawsFoo objects to `vscode.QuickPickItem` objects.
 */
export function asQuickpickItem<T extends caws.CawsResource>(resource: T): DataQuickPickItem<T> {
    let label: string

    if (resource.type === 'repo') {
        label = createRepoLabel(resource)
    } else if (resource.type === 'project') {
        label = `${resource.org.name} / ${resource.name}`
    } else if (resource.type === 'env') {
        return { ...fromWorkspace(resource), data: resource }
    } else {
        label = `${resource.name}`
    }

    return {
        label,
        detail: resource.description,
        data: resource,
    }
}

function fromWorkspace(env: caws.CawsDevEnv): Omit<DataQuickPickItem<unknown>, 'data'> {
    const repo = env.repositories[0]

    if (!repo) {
        throw new Error('Workspace does not have an associated repository')
    }

    const labelParts = [] as string[]

    if (env.status === 'RUNNING') {
        labelParts.push('$(pass) ')
    } else {
        labelParts.push('$(circle-slash) ') // TODO(sijaden): get actual 'stopped' icon
    }

    labelParts.push(`${repo.repositoryName}/${repo.branchName}`)

    if (env.alias) {
        labelParts.push(` ${env.alias}`)
    }

    const lastUsed = `Last used: ${getRelativeDate(env.lastUpdatedTime)}`

    return {
        label: labelParts.join(''),
        description: env.status === 'RUNNING' ? 'RUNNING - IN USE' : env.status,
        detail: `${env.org.name}/${env.project.name}, ${lastUsed}`,
    }
}

function createResourcePrompter<T extends caws.CawsResource>(
    resources: AsyncCollection<T[]>,
    presentation: Omit<ExtendedQuickPickOptions<T>, 'buttons'>
): QuickPickPrompter<T> {
    const refresh = createRefreshButton()
    const items = resources.map(p => p.map(asQuickpickItem))
    const prompter = createQuickPick(items, {
        buttons: [refresh, ...createCommonButtons(getHelpUrl())],
        ...presentation,
    })

    refresh.onClick = () => {
        prompter.clearAndLoadItems(items)
    }

    return prompter
}

export function createOrgPrompter(client: caws.ConnectedCawsClient): QuickPickPrompter<caws.CawsOrg> {
    return createResourcePrompter(client.listOrgs(), {
        title: 'Select a Code.AWS Organization',
        placeholder: 'Search for an Organization',
    })
}

export function createProjectPrompter(
    client: caws.ConnectedCawsClient,
    org?: caws.CawsOrg
): QuickPickPrompter<caws.CawsProject> {
    const projects = org ? client.listProjects({ organizationName: org.name }) : client.listResources('project')

    return createResourcePrompter(projects, {
        title: 'Select a Code.AWS Project',
        placeholder: 'Search for a Project',
    })
}

export function createRepoPrompter(
    client: caws.ConnectedCawsClient,
    proj?: caws.CawsProject
): QuickPickPrompter<caws.CawsRepo> {
    const repos = proj
        ? client.listRepos({ organizationName: proj.org.name, projectName: proj.name })
        : client.listResources('repo')

    return createResourcePrompter(repos, {
        title: 'Select a Code.AWS Repository',
        placeholder: 'Search for a Repository',
    })
}

export function createDevEnvPrompter(
    client: caws.ConnectedCawsClient,
    proj?: caws.CawsProject
): QuickPickPrompter<caws.CawsDevEnv> {
    const envs = proj ? client.listDevEnvs(proj) : client.listResources('env')
    const filtered = envs.map(arr => arr.filter(env => env.ide === 'VSCode'))
    const isData = <T>(obj: T | DataQuickPickItem<T>['data']): obj is T => {
        return typeof obj !== 'function' && isValidResponse(obj)
    }

    return createResourcePrompter(filtered, {
        title: 'Select a Code.AWS Workspace',
        placeholder: 'Search for a Workspace',
        compare: (a, b) => {
            if (isData(a.data) && isData(b.data)) {
                if (a.data.status === b.data.status) {
                    return b.data.lastUpdatedTime.getTime() - a.data.lastUpdatedTime.getTime()
                }

                return a.data.status === 'RUNNING' ? 1 : b.data.status === 'RUNNING' ? -1 : 0
            }

            return 0
        },
    })
}

type ResourceType = caws.CawsResource['type']

export async function selectCawsResource<T extends ResourceType>(
    client: caws.ConnectedCawsClient,
    type: T & ResourceType
): Promise<(caws.CawsResource & { type: typeof type }) | undefined> {
    const prompter = (() => {
        switch (type as ResourceType) {
            case 'org':
                return createOrgPrompter(client)
            case 'project':
                return createProjectPrompter(client)
            case 'repo':
                return createRepoPrompter(client)
            case 'env':
                return createDevEnvPrompter(client)
        }
    })()

    const response = await prompter.prompt()
    return isValidResponse(response) ? (response as caws.CawsResource & { type: T }) : undefined
}

/**
 * Special-case of {@link createRepoPrompter} for creating a new workspace
 */
export async function selectRepoForWorkspace(client: caws.ConnectedCawsClient): Promise<caws.CawsRepo | undefined> {
    const repos = associateWorkspace(client, client.listResources('repo').flatten())

    const refresh = createRefreshButton()
    const items = repos.map(repo => [
        {
            ...asQuickpickItem(repo),
            invalidSelection: repo.developmentWorkspace !== undefined,
            description: repo.developmentWorkspace ? `Repository already has a workspace` : '',
        },
    ])

    const prompter = createQuickPick(items, {
        buttons: [refresh, ...createCommonButtons(getHelpUrl())],
        title: 'Select a Code.AWS Repository',
        placeholder: 'Search for a Repository',
        compare: (a, b) => {
            if (a.invalidSelection === b.invalidSelection) {
                return 0
            }

            return a.invalidSelection ? 1 : b.invalidSelection ? -1 : 0
        },
    })

    refresh.onClick = () => {
        prompter.clearAndLoadItems(items)
    }

    const response = await prompter.prompt()
    return isValidResponse(response) ? response : undefined
}
