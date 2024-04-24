/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthFormId =
    | 'credentials'
    | 'builderIdCodeWhisperer'
    | 'builderIdCodeCatalyst'
    | 'identityCenterCodeWhisperer'
    | 'identityCenterCodeCatalyst'
    | 'identityCenterExplorer'
    | 'aggregateExplorer'

export function isBuilderIdAuth(id: AuthFormId): boolean {
    return id.startsWith('builderId')
}

export const AuthFormDisplayName: Record<AuthFormId, string> = {
    credentials: 'IAM Credentials',
    builderIdCodeCatalyst: 'CodeCatalyst with AWS Builder ID',
    builderIdCodeWhisperer: 'Amazon Q with AWS Builder ID',
    identityCenterCodeCatalyst: 'CodeCatalyst with IAM Identity Center',
    identityCenterCodeWhisperer: 'Amazon Q with IAM Identity Center',
    identityCenterExplorer: 'AWS Explorer with IAM Identity Center',
    aggregateExplorer: '',
} as const
