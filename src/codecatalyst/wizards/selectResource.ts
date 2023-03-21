/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isCloud9 } from '../../shared/extensionUtilities'
import * as codecatalyst from '../../shared/clients/codecatalystClient'
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
import { associateDevEnv, docs } from '../model'
import { getHelpUrl, isCodeCatalystVSCode } from '../utils'

export function createRepoLabel(r: codecatalyst.CodeCatalystRepo): string {
    return `${r.org.name} / ${r.project.name} / ${r.name}`
}

/**
 * Maps CodeCatalystFoo objects to `vscode.QuickPickItem` objects.
 */
export function asQuickpickItem<T extends codecatalyst.CodeCatalystResource>(resource: T): DataQuickPickItem<T> {
    switch (resource.type) {
        case 'project':
            return {
                label: `${resource.org.name} / ${resource.name}`,
                description: resource.description,
                data: resource,
            }
        case 'repo':
            return {
                label: createRepoLabel(resource),
                description: resource.description,
                data: resource,
            }
        case 'devEnvironment':
            return { ...fromDevEnv(resource), data: resource }
        case 'org':
            return { label: resource.name, detail: resource.description, data: resource }
        default:
            return { label: resource.name, data: resource }
    }
}

function fromDevEnv(env: codecatalyst.DevEnvironment): Omit<DataQuickPickItem<unknown>, 'data'> {
    const labelParts = [] as string[]

    if (env.status === 'RUNNING') {
        labelParts.push('$(pass) ')
    } else {
        labelParts.push('$(circle-slash) ') // TODO(sijaden): get actual 'stopped' icon
    }

    const repo = env.repositories[0]

    if (repo) {
        const branchName = repo.branchName?.replace('refs/heads/', '')
        labelParts.push(branchName ? `${repo.repositoryName}/${branchName}` : repo.repositoryName)
    } else {
        labelParts.push(`${env.id} (no repository)`)
    }

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

function createResourcePrompter<T extends codecatalyst.CodeCatalystResource>(
    resources: AsyncCollection<T[]>,
    helpUri: vscode.Uri,
    presentation: Omit<ExtendedQuickPickOptions<T>, 'buttons'>
): QuickPickPrompter<T> {
    const refresh = createRefreshButton()
    const items = resources.map(p => p.map(asQuickpickItem))
    const prompter = createQuickPick(items, {
        buttons: [refresh, ...createCommonButtons(helpUri)],
        ...presentation,
    })

    refresh.onClick = () => {
        prompter.clearAndLoadItems(items)
    }

    return prompter
}

export function createOrgPrompter(
    client: codecatalyst.CodeCatalystClient
): QuickPickPrompter<codecatalyst.CodeCatalystOrg> {
    const helpUri = isCloud9() ? docs.cloud9.main : docs.vscode.main
    return createResourcePrompter(client.listSpaces(), helpUri, {
        title: 'Select a CodeCatalyst Organization',
        placeholder: 'Search for an Organization',
    })
}

export function createProjectPrompter(
    client: codecatalyst.CodeCatalystClient,
    spaceName?: codecatalyst.CodeCatalystOrg['name']
): QuickPickPrompter<codecatalyst.CodeCatalystProject> {
    const helpUri = isCloud9() ? docs.cloud9.main : docs.vscode.main
    const projects = spaceName ? client.listProjects({ spaceName }) : client.listResources('project')

    return createResourcePrompter(projects, helpUri, {
        title: 'Select a CodeCatalyst Project',
        placeholder: 'Search for a Project',
    })
}

export function createRepoPrompter(
    client: codecatalyst.CodeCatalystClient,
    proj?: codecatalyst.CodeCatalystProject
): QuickPickPrompter<codecatalyst.CodeCatalystRepo> {
    const helpUri = isCloud9() ? docs.cloud9.cloneRepo : docs.vscode.main
    const repos = proj
        ? client.listSourceRepositories({ spaceName: proj.org.name, projectName: proj.name })
        : client.listResources('repo')

    return createResourcePrompter(repos, helpUri, {
        title: 'Select a CodeCatalyst Repository',
        placeholder: 'Search for a Repository',
    })
}

export function createDevEnvPrompter(
    client: codecatalyst.CodeCatalystClient,
    proj?: codecatalyst.CodeCatalystProject
): QuickPickPrompter<codecatalyst.DevEnvironment> {
    const helpUri = isCloud9() ? docs.cloud9.devenv : docs.vscode.devenv
    const envs = proj ? client.listDevEnvironments(proj) : client.listResources('devEnvironment')
    const filtered = envs.map(arr => arr.filter(env => isCodeCatalystVSCode(env.ides)))
    const isData = <T>(obj: T | DataQuickPickItem<T>['data']): obj is T => {
        return typeof obj !== 'function' && isValidResponse(obj)
    }

    return createResourcePrompter(filtered, helpUri, {
        title: 'Select a CodeCatalyst Dev Environment',
        placeholder: 'Search for a Dev Environment',
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

type ResourceType = codecatalyst.CodeCatalystResource['type']

export async function selectCodeCatalystResource<T extends ResourceType>(
    client: codecatalyst.CodeCatalystClient,
    type: T & ResourceType
): Promise<(codecatalyst.CodeCatalystResource & { type: typeof type }) | undefined> {
    const prompter = (() => {
        switch (type as ResourceType) {
            case 'org':
                return createOrgPrompter(client)
            case 'project':
                return createProjectPrompter(client)
            case 'repo':
                return createRepoPrompter(client)
            case 'branch':
                throw new Error('Picking a branch is not supported')
            case 'devEnvironment':
                return createDevEnvPrompter(client)
        }
    })()

    const response = await prompter.prompt()
    return isValidResponse(response) ? (response as codecatalyst.CodeCatalystResource & { type: T }) : undefined
}

/**
 * Special-case of {@link createRepoPrompter} for creating a new devenv
 */
export async function selectRepoForDevEnv(
    client: codecatalyst.CodeCatalystClient
): Promise<codecatalyst.CodeCatalystRepo | undefined> {
    const repos = associateDevEnv(client, client.listResources('repo').flatten())

    const refresh = createRefreshButton()
    const items = repos.map(repo => [
        {
            ...asQuickpickItem(repo),
            invalidSelection: repo.devEnv !== undefined,
            description: repo.devEnv ? `Repository already has a Dev Environment` : '',
        },
    ])

    const prompter = createQuickPick(items, {
        buttons: [refresh, ...createCommonButtons(getHelpUrl())],
        title: 'Select a CodeCatalyst Repository',
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
