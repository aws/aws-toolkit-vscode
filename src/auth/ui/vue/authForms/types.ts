/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthFormId =
    | 'credentials'
    | 'builderIdCodeWhisperer'
    | 'builderIdCodeCatalyst'
    | 'identityCenterCodeWhisperer'
    | 'identityCenterExplorer'
    | 'aggregateExplorer'

export const AuthFormDisplayName: Record<AuthFormId, string> = {
    credentials: 'IAM Credentials',
    builderIdCodeCatalyst: 'CodeCatalyst with AWS Builder ID',
    builderIdCodeWhisperer: 'CodeWhisperer with AWS Builder ID',
    identityCenterCodeWhisperer: 'CodeWhisperer with IAM Identity Center',
    identityCenterExplorer: 'AWS Explorer with IAM Identity Center',
    aggregateExplorer: '',
} as const
