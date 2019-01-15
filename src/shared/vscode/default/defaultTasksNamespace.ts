/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { TasksNamespace } from '..'

export class DefaultTasksNamespace implements TasksNamespace {
    public get taskExecutions(): ReadonlyArray<vscode.TaskExecution> {
        return vscode.tasks.taskExecutions
    }
    public set taskExecutions(value: ReadonlyArray<vscode.TaskExecution>) {
        vscode.tasks.taskExecutions = value
    }

    public get onDidStartTask(): vscode.Event<vscode.TaskStartEvent> {
        return vscode.tasks.onDidStartTask
    }

    public get onDidEndTask(): vscode.Event<vscode.TaskEndEvent> {
        return vscode.tasks.onDidEndTask
    }

    public get onDidStartTaskProcess(): vscode.Event<vscode.TaskProcessStartEvent> {
        return vscode.tasks.onDidStartTaskProcess
    }

    public get onDidEndTaskProcess(): vscode.Event<vscode.TaskProcessEndEvent> {
        return vscode.tasks.onDidEndTaskProcess
    }

    public registerTaskProvider(type: string, provider: vscode.TaskProvider): vscode.Disposable {
        return vscode.tasks.registerTaskProvider(type, provider)
    }

    public fetchTasks(filter?: vscode.TaskFilter): Thenable<vscode.Task[]> {
        return vscode.tasks.fetchTasks(filter)
    }

    public executeTask(task: vscode.Task): Thenable<vscode.TaskExecution> {
        return vscode.tasks.executeTask(task)
    }
}
