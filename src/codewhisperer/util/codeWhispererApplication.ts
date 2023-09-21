/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'

class CodeWhispererApplication {
    static #instance: CodeWhispererApplication

    readonly _clearCodeWhispererUIListener: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly clearCodeWhispererUIListener: vscode.Event<void> = this._clearCodeWhispererUIListener.event

    public static get instance() {
        return (this.#instance ??= new CodeWhispererApplication())
    }
}

export const application = () => CodeWhispererApplication.instance
