/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export type AuthError = { id: string; text: string }
export type ServiceItemId = 'awsExplorer' | 'codewhisperer' | 'codecatalyst'
export const userCancelled = 'userCancelled'
export const authSucceeded = 'authSucceeded'

export function isServiceItemId(value: unknown): value is ServiceItemId {
    return (
        typeof value === 'string' && (value === 'awsExplorer' || value === 'codewhisperer' || value === 'codecatalyst')
    )
}
