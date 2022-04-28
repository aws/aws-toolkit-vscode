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
import { isValidResponse } from '../../shared/wizards/wizard'
import { getHelpUrl } from '../utils'

export function createRepoLabel(r: caws.CawsRepo): string {
    return `${r.org.name} / ${r.project.name} / ${r.name}`
}

/**
 * Maps CawsFoo objects to `vscode.QuickPickItem` objects.
 */
export function asQuickpickItem<T extends caws.CawsResource>(resource: T): DataQuickPickItem<T> {
    let label: string
    let desc = resource.id

    if (resource.type === 'repo') {
        label = createRepoLabel(resource)
    } else if (resource.type === 'project') {
        label = `${resource.org.name} / ${resource.name}`
    } else if (resource.type === 'env') {
        const repo1 = resource.repositories[0]?.repositoryName
        label = `${resource.org.name} / ${resource.project.name} / ${repo1}`
        desc = `${resource.lastUpdatedTime.toISOString()} ${resource.ide} ${resource.status}`
    } else {
        label = `${resource.name}`
    }

    return {
        label,
        detail: resource.description,
        description: desc,
        data: resource,
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
        title: 'Select a CODE.AWS Organization',
        placeholder: 'Choose an organization',
    })
}

export function createProjectPrompter(
    client: caws.ConnectedCawsClient,
    org?: caws.CawsOrg
): QuickPickPrompter<caws.CawsProject> {
    const projects = org ? client.listProjects({ organizationName: org.name }) : client.listResources('project')

    return createResourcePrompter(projects, {
        title: 'Select a CODE.AWS Project',
        placeholder: 'Choose a project',
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
        title: 'Select a CODE.AWS Repository',
        placeholder: 'Choose a repository',
    })
}

export function createDevEnvPrompter(
    client: caws.ConnectedCawsClient,
    proj?: caws.CawsProject
): QuickPickPrompter<caws.CawsDevEnv> {
    const envs = proj ? client.listDevEnvs(proj) : client.listResources('env')

    return createResourcePrompter(envs, {
        title: 'Select a CODE.AWS Development Environment',
        placeholder: 'Choose a dev env',
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
