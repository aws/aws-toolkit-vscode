/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import * as vscode from 'vscode'

/**
 * Components associated with {@link vscode.commands}.
 */
export interface Commands {
    /**
     * See {@link vscode.commands.executeCommand}.
     */
    execute<T>(command: string, ...rest: any[]): Thenable<T | undefined>
}

export * from './defaultCommands'
