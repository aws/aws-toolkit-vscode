/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from './commands'

export class DefaultCommands implements Commands {
    public execute<T>(command: string, ...rest: any[]): Thenable<T | undefined> {
        return vscode.commands.executeCommand(command, ...rest)
    }
}
