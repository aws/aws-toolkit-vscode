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
