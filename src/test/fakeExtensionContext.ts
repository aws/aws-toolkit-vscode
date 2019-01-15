/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { types as vscode } from '../shared/vscode'

export class FakeExtensionContext implements vscode.ExtensionContext {
    public subscriptions: {
        dispose(): any;
    }[] = []
    public workspaceState: vscode.Memento = new FakeMemento()
    public globalState: vscode.Memento = new FakeMemento()
    public extensionPath: string = ''
    public storagePath: string | undefined

    public asAbsolutePath(relativePath: string): string {
        throw new Error('Method not implemented.')
    }
}

class FakeMemento implements vscode.Memento {
    public get<T>(key: string): T | undefined
    public  get<T>(key: string, defaultValue: T): T
    public get(key: any, defaultValue?: any) {
        throw new Error('Method not implemented.')
    }
    public update(key: string, value: any): Thenable<void> {
        throw new Error('Method not implemented.')
    }
}
