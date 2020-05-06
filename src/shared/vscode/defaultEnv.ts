/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Clipboard, Env } from './env'

export class DefaultEnv implements Env {
    public readonly clipboard = new DefaultClipboard()
}

export class DefaultClipboard implements Clipboard {
    public writeText(text: string): Thenable<void> {
        return vscode.env.clipboard.writeText(text)
    }
}
