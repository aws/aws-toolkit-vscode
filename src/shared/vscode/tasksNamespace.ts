/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from './types'

export interface TasksNamespace {
    taskExecutions: ReadonlyArray<vscode.TaskExecution>

    readonly onDidStartTask: vscode.Event<vscode.TaskStartEvent>

    readonly onDidEndTask: vscode.Event<vscode.TaskEndEvent>

    readonly onDidStartTaskProcess: vscode.Event<vscode.TaskProcessStartEvent>

    readonly onDidEndTaskProcess: vscode.Event<vscode.TaskProcessEndEvent>

    registerTaskProvider(type: string, provider: vscode.TaskProvider): vscode.Disposable

    fetchTasks(filter?: vscode.TaskFilter): Thenable<vscode.Task[]>

    executeTask(task: vscode.Task): Thenable<vscode.TaskExecution>
}
