/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsoProfile, SsoConnection } from '../../auth/connection'

/**
 * Scope for SageMaker Unified Studio authentication
 */
export const scopeSmus = 'datazone:domain:access'

/**
 * SageMaker Unified Studio profile extending the base SSO profile
 */
export interface SmusProfile extends SsoProfile {
    readonly domainUrl: string
    readonly domainId: string
}

/**
 * SageMaker Unified Studio connection extending the base SSO connection
 */
export interface SmusConnection extends SmusProfile, SsoConnection {
    readonly id: string
    readonly label: string
}

/**
 * Creates a SageMaker Unified Studio profile
 * @param domainUrl The SageMaker Unified Studio domain URL
 * @param domainId The SageMaker Unified Studio domain ID
 * @param startUrl The SSO start URL (issuer URL)
 * @param region The AWS region
 * @returns A SageMaker Unified Studio profile
 */
export function createSmusProfile(
    domainUrl: string,
    domainId: string,
    startUrl: string,
    region: string,
    scopes = [scopeSmus]
): SmusProfile & { readonly scopes: string[] } {
    return {
        scopes,
        type: 'sso',
        startUrl,
        ssoRegion: region,
        domainUrl,
        domainId,
    }
}

/**
 * Checks if a connection is a valid SageMaker Unified Studio connection
 * @param conn Connection to check
 * @returns True if the connection is a valid SMUS connection
 */
export function isValidSmusConnection(conn?: any): conn is SmusConnection {
    if (!conn || conn.type !== 'sso') {
        return false
    }
    // Check if the connection has the required SMUS scope
    const hasScope = Array.isArray(conn.scopes) && conn.scopes.includes(scopeSmus)
    // Check if the connection has the required SMUS properties
    const hasSmusProps = 'domainUrl' in conn && 'domainId' in conn
    return !!hasScope && !!hasSmusProps
}
