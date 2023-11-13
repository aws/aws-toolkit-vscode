/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextDocumentContentProvider, Event, Uri, CancellationToken, workspace, ExtensionContext } from 'vscode'
import https = require('https')

// The scheme 'https' is reserved, but it using it doesn't seem to give the behavior we want, so registering a customhttps scheme here.
export function registerAssetsHttpsFileSystem(context: ExtensionContext): void {
    context.subscriptions.push(
        workspace.registerTextDocumentContentProvider('customhttps', new AssetsContentProvider())
    )
}

class AssetsContentProvider implements TextDocumentContentProvider {
    onDidChange?: Event<Uri> | undefined = undefined

    async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        return await httpGet({
            host: uri.authority.replace('customhttps', 'https'),
            path: uri.path,
        })
    }
}

export async function httpGet(options: https.RequestOptions): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        options.method = 'GET'
        https
            .get(options, res => {
                res.setEncoding('utf8')
                let body = ''
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                res.on('data', chunk => (body += chunk))
                res.on('end', () => resolve(body))
            })
            .on('error', reject)
    })
}
