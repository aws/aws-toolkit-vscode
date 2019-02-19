/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ExtensionContext, Memento } from 'vscode'

export class FakeExtensionContext implements ExtensionContext {
    public subscriptions: {
        dispose(): any;
    }[] = []
    public workspaceState: Memento = new FakeMemento()
    public globalState: Memento = new FakeMemento()
    public extensionPath: string = ''
    public storagePath: string | undefined
    public globalStoragePath: string = ''
    public logPath: string = ''

    public asAbsolutePath(relativePath: string): string {
        throw new Error('Method not implemented.')
    }
}

class FakeMemento implements Memento {
    public get<T>(key: string): T | undefined
    public  get<T>(key: string, defaultValue: T): T
    public get(key: any, defaultValue?: any) {
        throw new Error('Method not implemented.')
    }
    public update(key: string, value: any): Thenable<void> {
        throw new Error('Method not implemented.')
    }
}
