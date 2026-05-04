/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    SmusAccessProject,
    SmusDeeplinkConnect,
    SmusLogin,
    SmusOpenRemoteConnection,
    SmusRenderLakehouseNode,
    SmusRenderProjectChildrenNode,
    SmusRenderRedshiftNode,
    SmusRenderS3Node,
    SmusSignOut,
    SmusStopSpace,
    Span,
} from '../../shared/telemetry/telemetry'
import { SmusAuthMode, SmusDomainMode } from '../../shared/telemetry/telemetry.gen'
import { SagemakerUnifiedStudioSpaceNode } from '../explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import { SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'
import { getLogger } from '../../shared/logger/logger'
import { getContext } from '../../shared/vscode/setContext'
import { ConnectionCredentialsProvider } from '../auth/providers/connectionCredentialsProvider'
import { DataZoneConnection } from './client/datazoneClient'
import { createDZClientBaseOnDomainMode } from '../explorer/nodes/utils'

const notSet = 'not-set'

const smusAuthModeValues: SmusAuthMode[] = ['sso', 'iam']
const smusDomainModeValues: SmusDomainMode[] = ['idc', 'iam']

function validateAuthMode(value: string | undefined): SmusAuthMode | undefined {
    return smusAuthModeValues.includes(value as SmusAuthMode) ? (value as SmusAuthMode) : undefined
}

function validateDomainMode(value: string | undefined): SmusDomainMode | undefined {
    return smusDomainModeValues.includes(value as SmusDomainMode) ? (value as SmusDomainMode) : undefined
}

/**
 * Gets the SMUS domain mode based on context
 */
export function getSmusDomainMode(): SmusDomainMode | undefined {
    try {
        const isIamModeDomain = getContext('aws.smus.isIamModeDomain')
        if (isIamModeDomain === undefined) {
            return undefined
        }
        return isIamModeDomain ? 'iam' : 'idc'
    } catch {
        return undefined
    }
}

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
        smusDomainMode: getSmusDomainMode(),
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
        smusDomainMode: getSmusDomainMode(),
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
    span: Span<SmusRenderLakehouseNode> | Span<SmusRenderS3Node> | Span<SmusRenderRedshiftNode>,
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
        smusDomainMode: getSmusDomainMode(),
    })

    try {
        const accountId = await connectionCredentialsProvider.getDomainAccountId()
        span.record({ smusDomainAccountId: accountId })
    } catch (err) {
        span.record({ smusDomainAccountId: notSet })
        logger.warn(`Failed to record domain account ID for data connection telemetry: ${(err as Error).message}`)
    }
}

/**
 * Records deeplink connect telemetry
 */
export function recordDeeplinkConnectTelemetry(
    span: Span<SmusDeeplinkConnect>,
    params: {
        connectionIdentifier: string
        smusDomainId?: string
        smusDomainAccountId?: string
        smusProjectId?: string
        smusDomainRegion?: string
        smusAuthMode?: string
        smusDomainMode?: string
    }
) {
    // Extract metadata from space ARN
    // ARN format: arn:aws:sagemaker:region:account-id:space/domain-id/space-name
    const spaceArnParts = params.connectionIdentifier.split(':')
    const resourceParts = spaceArnParts[5]?.split('/') // Gets "space/domain-id/space-name"

    const projectRegion = spaceArnParts[3] // region from ARN
    const projectAccountId = spaceArnParts[4] // account-id from ARN
    const domainIdFromArn = resourceParts?.[1] // domain-id from ARN
    const spaceName = resourceParts?.[2] // space-name from ARN

    const smusAuthMode = validateAuthMode(params.smusAuthMode)
    const smusDomainMode = validateDomainMode(params.smusDomainMode)

    span.record({
        smusDomainId: params.smusDomainId,
        smusDomainAccountId: params.smusDomainAccountId,
        smusProjectId: params.smusProjectId,
        smusDomainRegion: params.smusDomainRegion,
        smusProjectRegion: projectRegion,
        smusProjectAccountId: projectAccountId,
        smusSpaceKey: domainIdFromArn && spaceName ? `${domainIdFromArn}/${spaceName}` : undefined,
        smusAuthMode: smusAuthMode,
        smusDomainMode: smusDomainMode,
    })
}

/**
 * Records access project telemetry
 */
export async function recordAccessProjectTelemetry(
    span: Span<SmusAccessProject>,
    authProvider: SmusAuthenticationProvider,
    projectId: string | undefined
) {
    const accountId = await authProvider.getDomainAccountId()
    span.record({
        smusAuthMode: authProvider.activeConnection?.type,
        smusDomainId: authProvider.getDomainId(),
        smusProjectId: projectId,
        smusDomainRegion: authProvider.getDomainRegion(),
        smusDomainAccountId: accountId,
        smusDomainMode: getSmusDomainMode(),
    })
}

/**
 * Records project children node telemetry
 */
export async function recordProjectChildrenTelemetry(
    span: Span<SmusRenderProjectChildrenNode>,
    authProvider: SmusAuthenticationProvider,
    projectId: string | undefined,
    domainId: string | undefined
) {
    const isInSmusSpace = getContext('aws.smus.inSmusSpaceEnvironment')
    const authMode = authProvider.activeConnection?.type
    const accountId = await authProvider.getDomainAccountId()

    span.record({
        smusToolkitEnv: isInSmusSpace ? 'smus_space' : 'local',
        smusDomainId: domainId,
        smusDomainAccountId: accountId,
        smusProjectId: projectId,
        smusDomainRegion: authProvider.getDomainRegion(),
        smusDomainMode: getSmusDomainMode(),
        ...(authMode && { smusAuthMode: authMode }),
    })
}
