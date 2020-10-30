/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import { default as stripAnsi } from 'strip-ansi'
import { getLogger } from '../logger'

export function removeAnsi(text: string): string {
    try {
        return stripAnsi(text)
    } catch (err) {
        getLogger().error('Unexpected error while removing Ansi from text: %O', err as Error)

        // Fall back to original text so callers aren't impacted
        return text
    }
}

/**
 * Hashes are not guaranteed to be stable across toolkit versions. We may change the implementation.
 */
export function getStringHash(text: string): string {
    const hash = crypto.createHash('sha256')

    hash.update(text)

    return hash.digest('hex')
}

/**
 * Using the 'sha1' hash is no longer recommended. This hash is used to specifically comply with the
 * Spec: 'SSO Login Token Flow' and is used only to name a file. It is advised to use a more secure
 * hash in most other cases.
 * @param text The text to hash
 */
export function getSHA1StringHash(text: string): string {
    const shasum = crypto.createHash('sha1')
    shasum.update(text) //lgtm [js/weak-cryptographic-algorithm]
    return shasum.digest('hex')
}
