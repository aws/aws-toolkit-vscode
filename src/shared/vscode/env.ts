/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import * as vscode from 'vscode'

/**
 * Components associated with {@link vscode.env}.
 */
export interface Env {
    clipboard: Clipboard
}

export interface Clipboard {
    /**
     * See {@link vscode.Clipboard.writeText}.
     */
    writeText(message: string): Thenable<void>
}

export * from './defaultEnv'
