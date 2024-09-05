/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ApplicationComposerManager } from '../../applicationcomposer/webviewManager'
import { globals } from '../../shared'
import { WebviewContext } from '../../applicationcomposer/types'
import { MockDocument } from '../fake/fakeDocument'

export async function createTemplate() {
    const manager = new ApplicationComposerManager(globals.context)
    const panel = await manager.createTemplate()
    assert.ok(panel)
    return panel
}

export async function createWebviewContext({
    defaultTemplateName,
    defaultTemplatePath,
    disposables,
    panel,
    fileWatches,
    textDocument,
    workSpacePath,
}: Partial<WebviewContext>): Promise<WebviewContext> {
    return {
        defaultTemplateName: defaultTemplateName ?? '',
        defaultTemplatePath: defaultTemplatePath ?? '',
        disposables: disposables ?? [],
        panel: panel ?? (await createTemplate()),
        fileWatches: fileWatches ?? {},
        textDocument: textDocument ?? new MockDocument('', 'foo', async () => true),
        workSpacePath: workSpacePath ?? '',
    }
}
