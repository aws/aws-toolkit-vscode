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
import { DataZoneConnection } from './client/datazoneClient'
import { createDZClientBaseOnDomainMode } from '../explorer/nodes/utils'

const notSet = 'not-set'
/**
 * Records space telemetry
 */
export async function recordSpaceTelemetry(
    span: Span<SmusOpenRemoteConnection> | Span<SmusStopSpace>,
    node: SagemakerUnifiedStudioSpaceNode
) {
    const logger = getLogger('smus')

    const parent = node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
    const authProvider = SmusAuthenticationProvider.fromContext()
    const projectId = parent?.getProjectId()
    const domainId = parent?.getAuthProvider()?.getDomainId()

    span.record({
        smusAuthMode: authProvider.activeConnection?.type,
        smusSpaceKey: node.resource.DomainSpaceKey,
        smusDomainRegion: node.resource.regionCode,
        smusDomainId: domainId,
        smusProjectId: projectId,
    })

    try {
        const accountId = await authProvider.getDomainAccountId()
        span.record({ smusDomainAccountId: accountId })
    } catch (err) {
        span.record({ smusDomainAccountId: notSet })
        logger.warn(`Failed to record domain account Id for telemetry in domain ${domainId}: ${(err as Error).message}`)
    }

    if (projectId) {
        try {
            const projectAccountId = await authProvider.getProjectAccountId(projectId)
            span.record({ smusProjectAccountId: projectAccountId })
        } catch (err) {
            span.record({ smusProjectAccountId: notSet })
            logger.warn(
                `Failed to record project account Id for telemetry in domain ${domainId}: ${(err as Error).message}`
            )
        }

        try {
            const dzClient = await createDZClientBaseOnDomainMode(authProvider)
            const toolingEnv = await dzClient.getToolingEnvironment(projectId)
            span.record({ smusProjectRegion: toolingEnv.awsAccountRegion })
        } catch (err) {
            span.record({ smusProjectRegion: notSet })
            logger.warn(`Failed to get project region for telemetry: ${(err as Error).message}`)
        }
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
    const logger = getLogger('smus')

    span.record({
        smusAuthMode: authProvider.activeConnection?.type,
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
        span.record({ smusDomainAccountId: notSet })
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
    const logger = getLogger('smus')

    const isInSmusSpace = getContext('aws.smus.inSmusSpaceEnvironment')
    const authProvider = SmusAuthenticationProvider.fromContext()

    span.record({
        smusAuthMode: authProvider.activeConnection?.type,
        smusToolkitEnv: isInSmusSpace ? 'smus_space' : 'local',
        smusDomainId: connection.domainId,
        smusProjectId: connection.projectId,
        smusConnectionId: connection.connectionId,
        smusConnectionType: connection.type,
        smusProjectRegion: connection.location?.awsRegion,
        smusProjectAccountId: connection.location?.awsAccountId,
    })

    try {
        const accountId = await connectionCredentialsProvider.getDomainAccountId()
        span.record({ smusDomainAccountId: accountId })
    } catch (err) {
        span.record({ smusDomainAccountId: notSet })
        logger.warn(`Failed to record domain account ID for data connection telemetry: ${(err as Error).message}`)
    }
}
