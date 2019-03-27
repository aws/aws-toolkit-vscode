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
    return path.split(_path.sep).join(_path.posix.sep)
}
