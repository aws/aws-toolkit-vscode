/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type ServiceItemId = 'documentTypeSupport' | 'resourceExplorer' | 'codewhisperer' | 'codecatalyst'

export function isServiceItemId(value: unknown): value is ServiceItemId {
    return (
        typeof value === 'string' &&
        (value === 'documentTypeSupport' ||
            value === 'resourceExplorer' ||
            value === 'codewhisperer' ||
            value === 'codecatalyst')
    )
}
