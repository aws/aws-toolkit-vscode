/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SpaceMappings {
    localCredential?: { [spaceName: string]: LocalCredentialProfile }
    deepLink?: { [spaceName: string]: DeeplinkSession }
}

export type LocalCredentialProfile =
    | { type: 'iam'; profileName: string }
    | { type: 'sso'; accessKey: string; secret: string; token: string }

export interface DeeplinkSession {
    requests: Record<string, SsmConnectionInfo>
    refreshUrl?: string
}

export interface SsmConnectionInfo {
    sessionId: string
    url: string
    token: string
    status?: 'fresh' | 'consumed' | 'pending'
}

export interface ServerInfo {
    pid: number
    port: number
}
