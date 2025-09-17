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

/**
 * Records space telemetry
 */
export async function recordSpaceTelemetry(
    span: Span<SmusOpenRemoteConnection> | Span<SmusStopSpace>,
    node: SagemakerUnifiedStudioSpaceNode
) {
    const parent = node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
    const authProvider = SmusAuthenticationProvider.fromContext()
    const accountId = await authProvider.getDomainAccountId()
    span.record({
        smusSpaceKey: node.resource.DomainSpaceKey,
        smusDomainRegion: node.resource.regionCode,
        smusDomainId: parent?.getAuthProvider()?.activeConnection?.domainId,
        smusDomainAccountId: accountId,
        smusProjectId: parent?.getProjectId(),
    })
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
            `Failed to resolve AWS account ID via STS Client for domain ${domainId} in region ${region}: ${err}`
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
    })
}
