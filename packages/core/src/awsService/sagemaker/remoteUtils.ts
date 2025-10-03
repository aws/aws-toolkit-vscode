/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fs } from '../../shared/fs/fs'
import { SagemakerClient } from '../../shared/clients/sagemaker'
import { RemoteAppMetadata } from './utils'
import { getLogger } from '../../shared/logger/logger'
import { parseArn } from './detached-server/utils'

export async function getRemoteAppMetadata(): Promise<RemoteAppMetadata> {
    try {
        const metadataPath = '/opt/ml/metadata/resource-metadata.json'
        const metadataContent = await fs.readFileText(metadataPath)
        const metadata = JSON.parse(metadataContent)

        const domainId = metadata.DomainId
        const spaceName = metadata.SpaceName

        if (!domainId || !spaceName) {
            throw new Error('DomainId or SpaceName not found in metadata file')
        }

        const { region } = parseArn(metadata.ResourceArn)

        const client = new SagemakerClient(region)
        const spaceDetails = await client.describeSpace({ DomainId: domainId, SpaceName: spaceName })

        const userProfileName = spaceDetails.OwnershipSettings?.OwnerUserProfileName

        if (!userProfileName) {
            throw new Error('OwnerUserProfileName not found in space details')
        }

        return {
            DomainId: domainId,
            UserProfileName: userProfileName,
        }
    } catch (error) {
        const logger = getLogger()
        logger.error(`getRemoteAppMetadata: Failed to read metadata file, using fallback values: ${error}`)
        return {
            DomainId: '',
            UserProfileName: '',
        }
    }
}
