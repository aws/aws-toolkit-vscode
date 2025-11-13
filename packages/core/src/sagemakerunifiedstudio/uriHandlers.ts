/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams } from '../shared/vscode/uriHandler'
import { ExtContext } from '../shared/extensions'
import { deeplinkConnect } from '../awsService/sagemaker/commands'
import { telemetry } from '../shared/telemetry/telemetry'
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
            await deeplinkConnect(
                ctx,
                params.connection_identifier,
                params.session,
                `${params.ws_url}&cell-number=${params['cell-number']}`, // Re-append cell-number to ws_url
                params.token,
                params.domain,
                params.app_type,
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
        'smus_domain_region'
    )

    return { ...requiredParams, ...optionalParams }
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

    return {
        smusDomainId: params.smus_domain_id,
        smusDomainAccountId: params.smus_domain_account_id,
        smusProjectId: params.smus_project_id,
        smusDomainRegion: params.smus_domain_region,
        smusProjectRegion: projectRegion,
        smusProjectAccountId: projectAccountId,
        smusSpaceKey: domainIdFromArn && spaceName ? `${domainIdFromArn}/${spaceName}` : undefined,
    }
}
