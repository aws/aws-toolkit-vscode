/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Convert query parameters into a mapping of the parameter names to their values.
 * Caveat: If the same parameter is present in the query twice then the latest one is used
 *
 * @param query Query is the `query` part of `http://www.example.com/some/path?query#fragment`.
 */
export function fromQueryToParameters(query: vscode.Uri['query']): Map<string, string> {
    const params = query.split('&')
    const queryMap = new Map()

    if (query === '') {
        return queryMap
    }

    for (const param of params) {
        const [name, value] = param.split('=')
        queryMap.set(name, value)
    }
    return queryMap
}

/**
 * Converts a string path to a Uri, or returns the given Uri if it is already a Uri.
 *
 * A convenience function so you do not need to care about the type of path received.
 */
export function toUri(path: string | vscode.Uri): vscode.Uri {
    if (path instanceof vscode.Uri) {
        return path
    }
    return vscode.Uri.file(path)
}
