/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type ServiceItemId = 'DOCUMENT_TYPE_SUPPORT' | 'RESOURCE_EXPLORER' | 'CODE_WHISPERER' | 'CODE_CATALYST'

export function isServiceItemId(value: unknown): value is ServiceItemId {
    return (
        typeof value === 'string' &&
        (value === 'DOCUMENT_TYPE_SUPPORT' ||
            value === 'RESOURCE_EXPLORER' ||
            value === 'CODE_WHISPERER' ||
            value === 'CODE_CATALYST')
    )
}
