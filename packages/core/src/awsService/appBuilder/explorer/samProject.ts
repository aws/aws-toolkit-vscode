/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import { SamConfig, SamConfigErrorCode } from '../../../shared/sam/config'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import { showViewLogsMessage } from '../../../shared/utilities/messages'

export interface SamApp {
    location: SamAppLocation
    resourceTree: ResourceTreeEntity[]
}

export interface SamAppLocation {
    samTemplateUri: vscode.Uri
    workspaceFolder: vscode.WorkspaceFolder
    projectRoot: vscode.Uri
}

export interface ResourceTreeEntity {
    Id: string
    Type: string
    Runtime?: string
    CodeUri?: string
    Handler?: string
    Events?: ResourceTreeEntity[]
    Path?: string
    Method?: string
    Environment?: {
        Variables: Record<string, any>
    }
}

export async function getStackName(projectRoot: vscode.Uri): Promise<any> {
    try {
        const samConfig = await SamConfig.fromProjectRoot(projectRoot)
        const stackName = await samConfig.getCommandParam('global', 'stack_name')
        const region = await samConfig.getCommandParam('global', 'region')

        return { stackName, region }
    } catch (error: any) {
        switch (error.code) {
            case SamConfigErrorCode.samNoConfigFound:
                getLogger().info('Stack name and/or region information not found in samconfig.toml: %O', error)
                break
            case SamConfigErrorCode.samConfigParseError:
                getLogger().error(
                    `Error parsing stack name and/or region information from samconfig.toml: ${error.message}. Ensure the information is correct.`,
                    error
                )
                void showViewLogsMessage('Encountered an issue reading samconfig.toml')
                break
            default:
                getLogger().warn(`Error parsing stack name and/or region information: ${error.message}`, error)
        }
        return {}
    }
}

export async function getApp(location: SamAppLocation): Promise<SamApp> {
    const samTemplate = await CloudFormation.tryLoad(location.samTemplateUri)
    if (!samTemplate.template) {
        throw new ToolkitError(`Template at ${location.samTemplateUri.fsPath} is not valid`)
    }
    const templateResources = getResourceEntity(samTemplate.template)

    const resourceTree = [...templateResources]

    return { location, resourceTree }
}

function getResourceEntity(template: any): ResourceTreeEntity[] {
    const resourceTree: ResourceTreeEntity[] = []

    for (const [logicalId, resource] of Object.entries(template?.Resources ?? []) as [string, any][]) {
        const resourceEntity: ResourceTreeEntity = {
            Id: logicalId,
            Type: resource.Type,
            Runtime: resource.Properties?.Runtime ?? template?.Globals?.Function?.Runtime,
            Handler: resource.Properties?.Handler ?? template?.Globals?.Function?.Handler,
            Events: resource.Properties?.Events ? getEvents(resource.Properties.Events) : undefined,
            CodeUri: resource.Properties?.CodeUri ?? template?.Globals?.Function?.CodeUri,
            Environment: resource.Properties?.Environment ?? template?.Globals?.Function?.Environment,
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
