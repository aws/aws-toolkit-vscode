/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CloudFormation from '../../cloudformation/cloudformation'
import { SamConfig } from '../../sam/config'
import { getLogger } from '../../logger/logger'
import { getFiles } from './detectSamProjects'

export interface SamApp {
    location: SamAppLocation
    resourceTree: ResourceTreeEntity[]
}

export interface SamAppLocation {
    samTemplateUri: vscode.Uri
    workspaceFolder: vscode.WorkspaceFolder
}

export interface ResourceTreeEntity {
    Id: string
    Type: string
    Runtime?: string
    Handler?: string
    Events?: ResourceTreeEntity[]
    Path?: string
    Method?: string
}

export async function getStackName(workspaceFolder: vscode.WorkspaceFolder): Promise<any> {
    try {
        const configUris = await getFiles(workspaceFolder, 'samconfig.toml', `**/.aws-sam/**`)
        if (configUris.length === 0) {
            return {}
        }

        const samConfig = await SamConfig.fromUri(configUris[0])

        let stackName = await samConfig.getParam('deploy', 'stack_name')
        let region = await samConfig.getParam('deploy', 'region')

        if (!stackName) {
            stackName = await samConfig.getParam('global', 'stack_name')
            region = await samConfig.getParam('global', 'region')
        }

        if (!stackName && !region) {
            return {}
        }

        return { stackName, region }
    } catch (error) {
        getLogger().debug('samProject: %s', error)
        throw error
    }
}

export async function getApp(location: SamAppLocation): Promise<SamApp> {
    const samTemplate = await CloudFormation.tryLoad(location.samTemplateUri)
    const templateResources = getResourceEntity(samTemplate.template?.Resources)
    const apiEventResources: ResourceTreeEntity[] = []
    for (const resource of templateResources) {
        if (resource.Events) {
            apiEventResources.push(...resource.Events)
        }
    }

    const resourceTree = [...templateResources, ...apiEventResources]

    return { location, resourceTree }
}

function getResourceEntity(resources: any): ResourceTreeEntity[] {
    const resourceTree: ResourceTreeEntity[] = []

    for (const [logicalId, resource] of Object.entries(resources) as [string, any][]) {
        const resourceEntity: ResourceTreeEntity = {
            Id: logicalId,
            Type: resource.Type,
            Runtime: resource.Properties ? resource.Properties.Runtime : undefined,
            Handler: resource.Properties ? resource.Properties.Handler : undefined,
            Events: resource.Properties.Events ? getEvents(resource.Properties.Events) : undefined,
        }
        resourceTree.push(resourceEntity)
    }

    return resourceTree
}

function getEvents(events: Record<string, any>): ResourceTreeEntity[] {
    const eventResources: ResourceTreeEntity[] = []

    for (const [eventsLogicalId, event] of Object.entries(events)) {
        const eventProperties = event.Properties
        const eventResource: ResourceTreeEntity = {
            Id: eventsLogicalId,
            Type: event.Type,
            Path: eventProperties.Path,
            Method: eventProperties.Method,
        }
        eventResources.push(eventResource)
    }

    return eventResources
}
