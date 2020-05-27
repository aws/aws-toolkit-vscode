/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import * as vscode from 'vscode'

/**
 * Components associated with {@link module:vscode.env}.
 */
export interface Env {
    clipboard: Clipboard
}

export namespace Env {
    export function vscode(): Env {
        return new DefaultEnv()
    }
}

export interface Clipboard {
    /**
     * See {@link module:vscode.Clipboard.writeText}.
     */
    writeText(message: string): Thenable<void>
}

class DefaultEnv implements Env {
    public get clipboard(): Clipboard {
        return vscode.env.clipboard
    }
}
