/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsoProfile, SsoConnection, Connection, IamConnection } from '../../auth/connection'

/**
 * Scope for SageMaker Unified Studio authentication
 */
export const scopeSmus = 'datazone:domain:access'

/**
 * SageMaker Unified Studio profile extending the base SSO profile
 */
export interface SmusSsoProfile extends SsoProfile {
    readonly domainUrl: string
    readonly domainId: string
}

/**
 * SageMaker Unified Studio SSO connection extending the base SSO connection
 */
export interface SmusSsoConnection extends SmusSsoProfile, SsoConnection {
    readonly id: string
    readonly label: string
}

/**
 * SageMaker Unified Studio IAM connection for credential profile authentication
 */
export interface SmusIamConnection extends IamConnection {
    readonly profileName: string
    readonly region: string
    readonly domainUrl: string
    readonly domainId: string
}

/**
 * Union type for all SMUS connection types (SSO and IAM)
 */
export type SmusConnection = SmusSsoConnection | SmusIamConnection

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
): SmusSsoProfile & { readonly scopes: string[] } {
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
 * Type guard to check if a connection is a SMUS IAM connection
 * @param conn Connection to check
 * @returns True if the connection is a SMUS IAM connection
 */
export function isSmusIamConnection(conn?: Connection): conn is SmusIamConnection {
    return !!(
        conn &&
        conn.type === 'iam' &&
        'profileName' in conn &&
        'region' in conn &&
        'domainId' in conn &&
        typeof conn.profileName === 'string' &&
        typeof conn.region === 'string' &&
        typeof conn.domainId === 'string'
    )
}

/**
 * Type guard to check if a connection is a SMUS SSO connection
 * @param conn Connection to check
 * @returns True if the connection is a SMUS SSO connection
 */
export function isSmusSsoConnection(conn?: Connection): conn is SmusSsoConnection {
    if (!conn || conn.type !== 'sso') {
        return false
    }
    // Check if the connection has the required SMUS scope
    const hasScope = Array.isArray((conn as any).scopes) && (conn as any).scopes.includes(scopeSmus)
    // Check if the connection has the required SMUS properties
    const hasSmusProps = 'domainUrl' in conn && 'domainId' in conn
    return !!hasScope && !!hasSmusProps
}

/**
 * Checks if a connection is a valid SageMaker Unified Studio connection (either SSO or IAM)
 * @param conn Connection to check
 * @param smusMetadata Optional SMUS metadata for IAM connections
 * @returns True if the connection is a valid SMUS connection
 */
export function isValidSmusConnection(conn?: any, smusMetadata?: any): conn is SmusConnection | IamConnection {
    // Accept SMUS SSO connections
    if (isSmusSsoConnection(conn)) {
        return true
    }

    // For IAM connections, check if they have SMUS metadata either in the connection or separately
    if (conn && conn.type === 'iam') {
        // Check if connection already has SMUS properties
        if (isSmusIamConnection(conn)) {
            return true
        }

        // Check if we have separate SMUS metadata for this IAM connection
        if (
            smusMetadata &&
            typeof smusMetadata.profileName === 'string' &&
            typeof smusMetadata.region === 'string' &&
            typeof smusMetadata.domainUrl === 'string' &&
            typeof smusMetadata.domainId === 'string'
        ) {
            return true
        }
    }

    return false
}
