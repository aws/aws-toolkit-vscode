/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { distance } from 'fastest-levenshtein'
import { getInlineSuggestEnabled } from '../../shared/utilities/editorUtilities'

export function getLocalDatetime() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return new Date().toLocaleString([], { timeZone: timezone })
}

export function isInlineCompletionEnabled() {
    return getInlineSuggestEnabled()
}

// With edit distance, complicate usermodification can be considered as simple edit(add, delete, replace),
// and thus the unmodified part of recommendation length can be deducted/approximated
// ex. (modified > original): originalRecom: foo -> modifiedRecom: fobarbarbaro, distance = 9, delta = 12 - 9 = 3
// ex. (modified == original): originalRecom: helloworld -> modifiedRecom: HelloWorld, distance = 2, delta = 10 - 2 = 8
// ex. (modified < original): originalRecom: CodeWhisperer -> modifiedRecom: CODE, distance = 12, delta = 13 - 12 = 1
export function getUnmodifiedAcceptedTokens(origin: string, after: string) {
    return Math.max(origin.length, after.length) - distance(origin, after)
}
