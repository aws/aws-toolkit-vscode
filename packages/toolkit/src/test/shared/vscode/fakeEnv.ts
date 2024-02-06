/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export class FakeClipboard implements vscode.Clipboard {
    public text: string = ''

    public async readText(): Promise<string> {
        return this.text
    }
    /**
     * Records the text that was written.
     *
     * @returns an empty Promise.
     */
    public async writeText(text: string): Promise<void> {
        this.text = text
    }
}
