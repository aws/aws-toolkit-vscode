/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'

/**
 * The format for user-contributed and extension-contributed snippets in VSCode.
 *
 * The snippets are objects in JSON files.
 *
 * @property prefix trigger word that displays the snippet in IntelliSense.
 * @property description a description of the snippet displayed by IntelliSense.
 * @property body one or more lines of content, which will be joined as multiple lines upon insertion.
 * Newlines and embedded tabs will be formatted according to the context in which the snippet is inserted.
 *
 * @see https://code.visualstudio.com/docs/editor/userdefinedsnippets
 * @see https://code.visualstudio.com/api/language-extensions/snippet-guide
 */
export interface Snippet {
    prefix: string
    description: string
    body: string[]
}

export async function parseSnippetsJson(file: string): Promise<Snippet[]> {
    const json: { [key: string]: Snippet } = await fs.readJson(file)
    return Object.values(json)
}
