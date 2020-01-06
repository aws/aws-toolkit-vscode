/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { default as stripAnsi } from 'strip-ansi'
import { getLogger } from '../logger'

export function removeAnsi(text: string): string {
    try {
        return stripAnsi(text)
    } catch (err) {
        getLogger().error('Unexpected error while removing Ansi from text', err as Error)

        // Fall back to original text so callers aren't impacted
        return text
    }
}

/**
 * Hashes are not guaranteed to be stable across toolkit versions.
 */
export function getStringHash(text: string): number {
    // Source: https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
    if (text.length === 0) {
        return 0
    }

    let hash: number = 0

    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i)
        // tslint:disable-next-line:no-bitwise
        hash = (hash << 5) - hash + charCode
        // tslint:disable-next-line:no-bitwise
        hash |= 0 // Convert to 32bit integer
    }

    return hash
}
