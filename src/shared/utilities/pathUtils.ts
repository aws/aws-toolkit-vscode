/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as _path from 'path'

export function getNormalizedRelativePath(from: string, to: string): string {
    return normalizeSeparator(_path.relative(from, to))
}

export function normalizeSeparator(path: string) {
    return path.replace(_path.sep, _path.posix.sep)
}
