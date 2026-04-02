/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams } from '../shared/vscode/uriHandler'
import { ExtContext } from '../shared/extensions'
import { deeplinkConnect } from '../awsService/sagemaker/commands'
import { telemetry } from '../shared/telemetry/telemetry'
import { SmusAuthMode } from '../shared/telemetry/telemetry.gen'
import { getLogger } from '../shared/logger/logger'

const amzHeaders = [
    'X-Amz-Security-Token',
    'X-Amz-Algorithm',
    'X-Amz-Date',
    'X-Amz-SignedHeaders',
    'X-Amz-Credential',
    'X-Amz-Expires',
    'X-Amz-Signature',
] as const
/**
 * Registers the SMUS deeplink URI handler at path `/connect/smus`.
 *
 * This handler processes deeplink URLs from the SageMaker Unified Studio console
 * to establish remote connections to SMUS spaces.
 *
 * @param ctx Extension context containing the URI handler
 * @returns Disposable for cleanup
 */
export function register(ctx: ExtContext) {
    async function connectHandler(params: ReturnType<typeof parseConnectParams>) {
        await telemetry.smus_deeplinkConnect.run(async (span) => {
            span.record(extractTelemetryMetadata(params))

            // WORKAROUND: The ws_url from the startSession API call contains a query parameter
            // 'cell-number' within itself. When the entire deeplink URL is processed by the URI
            // handler, 'cell-number' is parsed as a standalone query parameter at the top level
            // instead of remaining part of the ws_url. This causes the ws_url to lose the
            // cell-number context it needs. To fix this, we manually re-append the cell-number
            // query parameter back to the ws_url to restore the original intended URL structure.
            let wsUrl = `${params.ws_url}&cell-number=${encodeURIComponent(params['cell-number'])}`

            for (const header of amzHeaders) {
                const value = params[header]
                if (value) {
                    wsUrl += `&${header}=${encodeURIComponent(value)}`
                }
            }

            await deeplinkConnect(
                ctx,
                params.connection_identifier,
                params.session,
                `${params.ws_url}&cell-number=${encodeURIComponent(params['cell-number'])}`, // Re-append cell-number to ws_url
                params.token,
                params.domain,
                params.app_type,
                undefined,
                undefined,
                undefined,
                true // isSMUS=true for SMUS connections
            )
        })
    }

    return vscode.Disposable.from(ctx.uriHandler.onPath('/connect/smus', connectHandler, parseConnectParams))
}

/**
 * Parses and validates SMUS deeplink URI parameters.
 *
 * Required parameters:
 * - connection_identifier: Space ARN identifying the SMUS space
 * - domain: Domain ID for the SMUS space (SM AI side)
 * - user_profile: User profile name
 * - session: SSM session ID
 * - ws_url: WebSocket URL for SSM connection (originally contains cell-number as a query param)
 * - cell-number: extracted from ws_url during URI parsing
 * - token: Authentication token
 *
 * Optional parameters:
 * - app_type: Application type (e.g., JupyterLab, CodeEditor)
 * - smus_domain_id: SMUS domain identifier
 * - smus_domain_account_id: SMUS domain account ID
 * - smus_project_id: SMUS project identifier
 * - smus_domain_region: SMUS domain region
 * - smus_auth_mode: Authentication mode (sso or iam)
 *
 * Note: The ws_url from startSession API originally includes cell-number as a query parameter.
 * However, when the deeplink URL is processed, the URI handler extracts cell-number as a
 * separate top-level parameter. This is why we need to re-append it in the connectHandler.
 *
 * @param query URI query parameters
 * @returns Parsed parameters object
 * @throws Error if required parameters are missing
 */
export function parseConnectParams(query: SearchParams) {
    // Extract session from ws_url as fallback. When the deep link URL contains sigv4 params
    // embedded inside ws_url with single percent-encoding, VS Code's URI parser can decode
    // the %26 separators, causing those params to break out as top-level query params and
    // displacing 'session'. The session ID is always present in the ws_url data-channel path.
    const wsUrl = query.get('ws_url')
    if (!query.has('session') && wsUrl) {
        const match = wsUrl.match(/data-channel\/([^?&]+)/)
        if (match) {
            getLogger().info(`Recovered missing session from ws_url: ${match[1]}`)
            query.set('session', match[1])
        }
    }

    const requiredParams = query.getFromKeysOrThrow(
        'connection_identifier',
        'domain',
        'user_profile',
        'session',
        'ws_url',
        'cell-number',
        'token'
    )
    const optionalParams = query.getFromKeys(
        'app_type',
        'smus_domain_id',
        'smus_domain_account_id',
        'smus_project_id',
        'smus_domain_region',
        'smus_auth_mode'
    )

    const amzHeaderParams = query.getFromKeys(...amzHeaders)
    return { ...requiredParams, ...optionalParams, ...amzHeaderParams }
}

/**
 * Extracts telemetry metadata from URI parameters and space ARN.
 *
 * @param params Parsed URI parameters
 * @returns Telemetry metadata object
 */
function extractTelemetryMetadata(params: ReturnType<typeof parseConnectParams>) {
    // Extract metadata from space ARN
    // ARN format: arn:aws:sagemaker:region:account-id:space/domain-id/space-name
    const arnParts = params.connection_identifier.split(':')
    const resourceParts = arnParts[5]?.split('/') // Gets "space/domain-id/space-name"

    const projectRegion = arnParts[3] // region from ARN
    const projectAccountId = arnParts[4] // account-id from ARN
    const domainIdFromArn = resourceParts?.[1] // domain-id from ARN
    const spaceName = resourceParts?.[2] // space-name from ARN

    // Validate and cast smusAuthMode to the expected type
    const authMode = params.smus_auth_mode
    const smusAuthMode: SmusAuthMode | undefined = authMode === 'sso' || authMode === 'iam' ? authMode : undefined

    return {
        smusDomainId: params.smus_domain_id,
        smusDomainAccountId: params.smus_domain_account_id,
        smusProjectId: params.smus_project_id,
        smusDomainRegion: params.smus_domain_region,
        smusProjectRegion: projectRegion,
        smusProjectAccountId: projectAccountId,
        smusSpaceKey: domainIdFromArn && spaceName ? `${domainIdFromArn}/${spaceName}` : undefined,
        smusAuthMode: smusAuthMode,
    }
}
