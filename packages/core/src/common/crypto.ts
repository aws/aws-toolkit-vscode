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

import { isWeb } from './webUtils'

export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    if (isWeb()) {
        return globalThis.crypto.randomUUID()
    }

    return require('crypto').randomUUID()
}
