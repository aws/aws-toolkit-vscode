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
