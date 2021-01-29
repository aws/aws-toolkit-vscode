/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import { default as stripAnsi } from 'strip-ansi'
import { isCloud9 } from '../extensionUtilities'
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


export function getSHA1StringHash(text: string): string {
    const shasum = crypto.createHash('sha1')
    shasum.update(text) //lgtm [js/weak-cryptographic-algorithm]
    return shasum.digest('hex')
}

/**
 * Temporary util while Cloud9 does not have codicon support
 */
export function addCodiconToString(codiconName: string, text: string): string {
    return isCloud9() ? text : `$(${codiconName}) ${text}`
}
