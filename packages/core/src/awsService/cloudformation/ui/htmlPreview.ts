/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewColumn } from 'vscode'
import { docPreview } from '../documents/documentPreview'

export async function htmlPreview(content: unknown, title: string) {
    if (typeof content !== 'string') {
        return
    }

    await docPreview({
        content: `# ${title}\n${content}`,
        language: 'markdown',
        viewColumn: ViewColumn.Beside,
        preserveFocus: true,
    })
}
