/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthFormId =
    | 'credentials'
    | 'builderIdCodeWhisperer'
    | 'builderIdCodeCatalyst'
    | 'identityCenterCodeWhisperer'

export const AuthFormDisplayName: Record<AuthFormId, string> = {
    credentials: 'IAM Credentials',
    builderIdCodeCatalyst: 'Builder ID',
    builderIdCodeWhisperer: 'Builder ID',
    identityCenterCodeWhisperer: 'IAM Identity Center',
} as const
