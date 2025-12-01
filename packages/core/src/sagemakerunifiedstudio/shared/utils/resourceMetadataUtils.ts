/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fs } from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'
import { isSageMaker } from '../../../shared/extensionUtilities'

/**
 * Resource metadata schema used by `resource-metadata.json` in SageMaker Unified Studio spaces
 */
export type ResourceMetadata = {
    AppType?: string
    DomainId?: string
    SpaceName?: string
    UserProfileName?: string
    ExecutionRoleArn?: string
    ResourceArn?: string
    ResourceName?: string
    AppImageVersion?: string
    AdditionalMetadata?: {
        DataZoneDomainId?: string
        DataZoneDomainRegion?: string
        DataZoneEndpoint?: string
        DataZoneEnvironmentId?: string
        DataZoneProjectId?: string
        DataZoneScopeName?: string
        DataZoneStage?: string
        DataZoneUserId?: string
        PrivateSubnets?: string
        ProjectS3Path?: string
        SecurityGroup?: string
    }
    ResourceArnCaseSensitive?: string
    IpAddressType?: string
} & Record<string, any>

const resourceMetadataPath = '/opt/ml/metadata/resource-metadata.json'
let resourceMetadata: ResourceMetadata | undefined = undefined

/**
 * Gets the cached resource metadata (must be initialized with `initializeResourceMetadata()` first)
 * @returns ResourceMetadata object or undefined if not yet initialized
 */
export function getResourceMetadata(): ResourceMetadata | undefined {
    return resourceMetadata
}

/**
 * Initializes resource metadata by reading and parsing the resource-metadata.json file
 */
export async function initializeResourceMetadata(): Promise<void> {
    const logger = getLogger('smus')

    if (!isSageMaker('SMUS') && !isSageMaker('SMUS-SPACE-REMOTE-ACCESS')) {
        logger.debug(`Not in SageMaker Unified Studio space, skipping initialization of resource metadata`)
        return
    }

    try {
        if (!(await resourceMetadataFileExists())) {
            logger.debug(`Resource metadata file not found at: ${resourceMetadataPath}`)
        }

        const fileContent = await fs.readFileText(resourceMetadataPath)
        resourceMetadata = JSON.parse(fileContent) as ResourceMetadata
        logger.debug(`Successfully read resource metadata from: ${resourceMetadataPath}`)
    } catch (error) {
        logger.error(`Failed to read or parse resource metadata file: ${error as Error}`)
    }
}

/**
 * Checks if the resource-metadata.json file exists
 * @returns True if the file exists, false otherwise
 */
export async function resourceMetadataFileExists(): Promise<boolean> {
    try {
        return await fs.existsFile(resourceMetadataPath)
    } catch (error) {
        const logger = getLogger('smus')
        logger.error(`Failed to check if resource metadata file exists: ${error as Error}`)
        return false
    }
}

/**
 * Resets the cached resource metadata
 */
export function resetResourceMetadata(): void {
    resourceMetadata = undefined
}
