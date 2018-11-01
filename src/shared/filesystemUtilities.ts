/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { accessAsync, readFileAsync } from './filesystem'

export async function fileExists(path: string): Promise<boolean> {
    try {
        await accessAsync(path)
    } catch (err) {
        return false
    }

    return true
}

/**
 * @description Wraps readFileAsync and resolves the Buffer to a string for convenience
 *
 * @param path filename to read
 * @param encoding Optional - file encoding
 *
 * @returns the contents of the file as a string
 */
export async function readFileAsString(path: string, encoding?: string): Promise<string> {
    // tslint:disable-next-line:no-null-keyword
    const result = await readFileAsync(path, encoding || null)
    if (result instanceof Buffer) {
        return result.toString(encoding || undefined)
    }

    return result
}
