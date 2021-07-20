/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { showOutputMessage } from '../../shared/utilities/messages'

export class S3DocumentProvider implements vscode.TextDocumentContentProvider {
    public constructor(public onDidChange: vscode.Event<vscode.Uri>) {}

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        let data: any
        try {
            //data = await fs.readFileSync(uri.fsPath)
            data = await readFileAsString(uri.fsPath)
        } catch (e) {
            showOutputMessage(`${e}`, ext.outputChannel)
        }

        return data ?? ''
    }
}
