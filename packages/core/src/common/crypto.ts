/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isWeb } from './webUtils'

export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    if (isWeb()) {
        return globalThis.crypto.randomUUID()
    }

    return require('crypto').randomUUID()
}
