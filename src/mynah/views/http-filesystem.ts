/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
import { TextDocumentContentProvider } from 'vscode'
import { httpGet } from './http-helpers'

// The scheme 'https' is reserved, but it using it doesn't seem to give the behavior we want, so registering a customhttps scheme here.
export function registerHttpsFileSystem(context: vs.ExtensionContext): void {
    context.subscriptions.push(
        vs.workspace.registerTextDocumentContentProvider('customhttps', new HttpsDocumentContentProvider())
    )
}

class HttpsDocumentContentProvider implements TextDocumentContentProvider {
    onDidChange?: vs.Event<vs.Uri> | undefined = undefined

    async provideTextDocumentContent(uri: vs.Uri, token: vs.CancellationToken): Promise<string> {
        return await httpGet({
            host: uri.authority.replace('customhttps', 'https'),
            path: uri.path,
        })
    }
}
