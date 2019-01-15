/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { EnvNamespace } from '..'

export class DefaultEnvNamespace implements EnvNamespace {
    public get appName(): string {
        return vscode.env.appName
    }
    public set appName(value: string) {
        vscode.env.appName = value
    }

    public get appRoot(): string {
        return vscode.env.appRoot
    }
    public set appRoot(value: string) {
        vscode.env.appRoot = value
    }

    public get language(): string {
        return vscode.env.language
    }
    public set language(value: string) {
        vscode.env.language = value
    }

    public get machineId(): string {
        return vscode.env.machineId
    }
    public set machineId(value: string) {
        vscode.env.machineId = value
    }

    public get sessionId(): string {
        return vscode.env.sessionId
    }
    public set sessionId(value: string) {
        vscode.env.sessionId = value
    }
}
