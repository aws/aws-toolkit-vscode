/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, Memento } from 'vscode'

export interface FakeMementoStorage {
    [key: string]: any
}

export interface FakeExtensionState {
    globalState?: FakeMementoStorage
    workspaceState?: FakeMementoStorage
}

export class FakeExtensionContext implements ExtensionContext {
    public subscriptions: {
        dispose(): any
    }[] = []
    public workspaceState: Memento = new FakeMemento()
    public globalState: Memento = new FakeMemento()
    public storagePath: string | undefined
    public globalStoragePath: string = '.'
    public logPath: string = ''
    private _extensionPath: string = ''

    public constructor(preload?: FakeExtensionState) {
        if (preload) {
            this.globalState = new FakeMemento(preload.globalState)
            this.workspaceState = new FakeMemento(preload.workspaceState)
        }
    }

    public get extensionPath(): string {
        return this._extensionPath
    }

    public set extensionPath(path: string) {
        this._extensionPath = path
    }

    public asAbsolutePath(relativePath: string): string {
        return relativePath
    }
}

class FakeMemento implements Memento {
    public constructor(private readonly _storage: FakeMementoStorage = {}) {}
    public get<T>(key: string): T | undefined
    public get<T>(key: string, defaultValue: T): T
    public get(key: any, defaultValue?: any) {
        if (this._storage.hasOwnProperty(String(key))) {
            return this._storage[key]
        }
        if (defaultValue) {
            return defaultValue
        }

        return undefined
    }
    public update(key: string, value: any): Thenable<void> {
        this._storage[key] = value

        return Promise.resolve()
    }
}
