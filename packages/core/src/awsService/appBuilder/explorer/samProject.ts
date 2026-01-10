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

export interface BaseResourceEntity {
    Id: string
    Type: string
}

export interface EventEntity extends BaseResourceEntity {
    Path?: string
    Method?: string
}

export interface FunctionResourceEntity extends BaseResourceEntity {
    Runtime?: string
    CodeUri?: string
    Handler?: string
    Events?: EventEntity[]
    Environment?: {
        Variables: Record<string, any>
    }
    CapacityProviderConfig?: string
    Architectures?: string
}

export interface CapacityProviderResourceEntity extends BaseResourceEntity {
    Architectures?: string
}

export type ResourceTreeEntity = FunctionResourceEntity | CapacityProviderResourceEntity | BaseResourceEntity

export function isFunctionResource(resource: ResourceTreeEntity): resource is FunctionResourceEntity {
    return resource.Type === CloudFormation.SERVERLESS_FUNCTION_TYPE
}

export function isCapacityProviderResource(resource: ResourceTreeEntity): resource is CapacityProviderResourceEntity {
    return resource.Type === CloudFormation.SERVERLESS_CAPACITY_PROVIDER_TYPE
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
        const resourceEntity = createResourceEntity(logicalId, resource, template)
        resourceTree.push(resourceEntity)
    }
    return resourceTree
}

function createResourceEntity(logicalId: string, resource: any, template: any): ResourceTreeEntity {
    const baseEntity: BaseResourceEntity = {
        Id: logicalId,
        Type: resource.Type,
    }

    // Create type-specific entities
    if (resource.Type === CloudFormation.SERVERLESS_FUNCTION_TYPE) {
        const functionEntity: FunctionResourceEntity = {
            ...baseEntity,
            Runtime: resource.Properties?.Runtime ?? template?.Globals?.Function?.Runtime,
            Handler: resource.Properties?.Handler ?? template?.Globals?.Function?.Handler,
            Events: resource.Properties?.Events ? getEvents(resource.Properties.Events) : undefined,
            CodeUri: resource.Properties?.CodeUri ?? template?.Globals?.Function?.CodeUri,
            Environment: resource.Properties?.Environment ?? template?.Globals?.Function?.Environment,
            CapacityProviderConfig:
                resource.Properties?.CapacityProviderConfig ?? template?.Globals?.Function?.CapacityProviderConfig,
            Architectures: resource.Properties?.Architectures?.[0] ?? template?.Globals?.Function?.Architectures?.[0],
        }
        return functionEntity
    }

    if (resource.Type === CloudFormation.SERVERLESS_CAPACITY_PROVIDER_TYPE) {
        const capacityProviderEntity: CapacityProviderResourceEntity = {
            ...baseEntity,
            Architectures:
                resource.Properties?.InstanceRequirements?.Architectures?.[0] ??
                template?.Globals?.CapacityProvider?.InstanceRequirements?.Architectures?.[0],
        }
        return capacityProviderEntity
    }

    // Generic resource for unsupported types
    return baseEntity
}

function getEvents(events: Record<string, any>): EventEntity[] {
    const eventResources: EventEntity[] = []

    for (const [eventsLogicalId, event] of Object.entries(events)) {
        const eventProperties = event.Properties
        const eventResource: EventEntity = {
            Id: eventsLogicalId,
            Type: event.Type,
            Path: eventProperties?.Path,
            Method: eventProperties?.Method,
        }
        eventResources.push(eventResource)
    }

    return eventResources
}
