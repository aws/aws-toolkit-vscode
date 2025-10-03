/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    SmusLogin,
    SmusOpenRemoteConnection,
    SmusRenderLakehouseNode,
    SmusRenderS3Node,
    SmusSignOut,
    SmusStopSpace,
    Span,
} from '../../shared/telemetry/telemetry'
import { SagemakerUnifiedStudioSpaceNode } from '../explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import { SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'
import { getLogger } from '../../shared/logger/logger'
import { getContext } from '../../shared/vscode/setContext'
import { ConnectionCredentialsProvider } from '../auth/providers/connectionCredentialsProvider'
import { DataZoneConnection, DataZoneClient } from './client/datazoneClient'

/**
 * Records space telemetry
 */
export async function recordSpaceTelemetry(
    span: Span<SmusOpenRemoteConnection> | Span<SmusStopSpace>,
    node: SagemakerUnifiedStudioSpaceNode
) {
    const logger = getLogger()

    try {
        const parent = node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
        const authProvider = SmusAuthenticationProvider.fromContext()
        const accountId = await authProvider.getDomainAccountId()
        const projectId = parent?.getProjectId()

        // Get project account ID and region
        let projectAccountId: string | undefined
        let projectRegion: string | undefined

        if (projectId) {
            projectAccountId = await authProvider.getProjectAccountId(projectId)

            // Get project region from tooling environment
            const dzClient = await DataZoneClient.getInstance(authProvider)
            const toolingEnv = await dzClient.getToolingEnvironment(projectId)
            projectRegion = toolingEnv.awsAccountRegion
        }

        span.record({
            smusSpaceKey: node.resource.DomainSpaceKey,
            smusDomainRegion: node.resource.regionCode,
            smusDomainId: parent?.getAuthProvider()?.activeConnection?.domainId,
            smusDomainAccountId: accountId,
            smusProjectId: projectId,
            smusProjectAccountId: projectAccountId,
            smusProjectRegion: projectRegion,
        })
    } catch (err) {
        logger.error(`Failed to record space telemetry: ${(err as Error).message}`)
    }
}

/**
 * Records auth telemetry
 */
export async function recordAuthTelemetry(
    span: Span<SmusLogin> | Span<SmusSignOut>,
    authProvider: SmusAuthenticationProvider,
    domainId: string | undefined,
    region: string | undefined
) {
    const logger = getLogger()

    span.record({
        smusDomainId: domainId,
        awsRegion: region,
    })

    try {
        if (!region) {
            throw new Error(`Region is undefined for domain ${domainId}`)
        }
        const accountId = await authProvider.getDomainAccountId()
        span.record({
            smusDomainAccountId: accountId,
        })
    } catch (err) {
        logger.error(
            `Failed to record Domain AccountId in data connection telemetry for domain ${domainId} in region ${region}: ${err}`
        )
    }
}

/**
 * Records data connection telemetry for SMUS nodes
 */
export async function recordDataConnectionTelemetry(
    span: Span<SmusRenderLakehouseNode> | Span<SmusRenderS3Node>,
    connection: DataZoneConnection,
    connectionCredentialsProvider: ConnectionCredentialsProvider
) {
    const logger = getLogger()

    try {
        const isInSmusSpace = getContext('aws.smus.inSmusSpaceEnvironment')
        const accountId = await connectionCredentialsProvider.getDomainAccountId()
        span.record({
            smusToolkitEnv: isInSmusSpace ? 'smus_space' : 'local',
            smusDomainId: connection.domainId,
            smusDomainAccountId: accountId,
            smusProjectId: connection.projectId,
            smusConnectionId: connection.connectionId,
            smusConnectionType: connection.type,
            smusProjectRegion: connection.location?.awsRegion,
            smusProjectAccountId: connection.location?.awsAccountId,
        })
    } catch (err) {
        logger.error(`Failed to record data connection telemetry: ${(err as Error).message}`)
    }
}
