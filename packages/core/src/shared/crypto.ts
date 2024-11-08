/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Why do we need this?
 *
 * Depending on environment (node vs web), `crypto` is different.
 * Node requires `crypto` to be imported, while in web it is available globally
 * through just calling `crypto` or `globalThis.crypto`.
 *
 * The crypto signatures and functions are not 1:1 between the environments.
 * So this module provides environment agnostic functions for `crypto`.
 *
 * ---
 *
 * Node `crypto` has `crypto.webcrypto` except the interface is more cumbersome to use
 * compared to node `crypto`. So we will want to eventually exclusively use functions
 * in this class instead of the `crypto` functions.
 *
 * Once we do not need `crypto` anymore, we can get rid of the polyfill.
 */
import { isWeb } from './extensionGlobals'

export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    if (isWeb()) {
        return globalThis.crypto.randomUUID()
    }

    return require('crypto').randomUUID()
}

/**
 * Returns true if the given string is a UUID
 *
 * NOTE: There are different UUID versions, this function does not discriminate between them.
 * See: https://stackoverflow.com/questions/7905929/how-to-test-valid-uuid-guid
 */
export function isUuid(uuid: string): boolean {
    // NOTE: This pattern must match, or at least be a subset of the "Session ID" pattern in `telemetry/service-2.json`
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidPattern.test(uuid)
}

/**
 * Eg: 'aaaabbbb-cccc-dddd-eeee-ffffhhhhiiii' -> 'aaaa...iiii'
 */
export function truncateUuid(uuid: string) {
    if (uuid.length !== 36) {
        throw new Error(`Cannot truncate uuid of value: "${uuid}"`)
    }

    const cleanedUUID = uuid.replace(/-/g, '')
    return `${cleanedUUID.substring(0, 4)}...${cleanedUUID.substring(cleanedUUID.length - 4)}`
}
