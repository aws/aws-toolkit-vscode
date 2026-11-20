/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import nodefs from 'fs/promises'
import sinon from 'sinon'
import { ApplicationComposerManager } from '../../applicationcomposer/webviewManager'
import { globals } from '../../shared'
import { WebviewContext } from '../../applicationcomposer/types'
import { MockDocument } from '../fake/fakeDocument'
import { hasCode } from '../../shared/errors'

/**
 * Creates a symbolic link at `linkPath` that points to `target`. On Windows, a folder link is
 * created as a junction, which needs no extra privileges. A file link needs extra privileges on
 * Windows, so the current test is skipped if the OS does not allow it.
 */
export async function createSymlinkOrSkip(
    test: Mocha.Context,
    target: string,
    linkPath: string,
    type: 'file' | 'dir' = 'file'
) {
    try {
        // Only Windows uses the type argument.
        await nodefs.symlink(target, linkPath, type === 'dir' ? 'junction' : 'file')
    } catch (e) {
        if (hasCode(e) && e.code === 'EPERM') {
            test.skip()
        }
        throw e
    }
}

export async function createTemplate() {
    const manager = await ApplicationComposerManager.create(globals.context)
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

/**
 * Fixed workspace context used by the lexical path-traversal tests, which assert on paths without
 * touching the filesystem.
 */
export const traversalWorkspaceContext: Partial<WebviewContext> = {
    workSpacePath: '/workspace/project',
    defaultTemplatePath: '/workspace/project/template.yaml',
}

/**
 * Builds a webview context with the given overrides, sends `request` to `handler`, and returns the
 * single response message that the handler posts back to the webview. Shared by the message-handler
 * tests so they do not each repeat the panel/spy/context setup.
 */
export async function getHandlerResponse<RequestT>(
    handler: (request: RequestT, context: WebviewContext) => Promise<void>,
    request: RequestT,
    contextOverrides: Partial<WebviewContext> = {}
) {
    const panel = await createTemplate()
    const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
    const context = await createWebviewContext({ panel, ...contextOverrides })

    await handler(request, context)

    assert.ok(postMessageSpy.calledOnce)
    return postMessageSpy.getCall(0).args[0]
}
