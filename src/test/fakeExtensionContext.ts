/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as del from 'del'
import { Memento } from 'vscode'
import { ExtensionDisposableFiles } from '../shared/utilities/disposableFiles'

export interface FakeMementoStorage {
    [key: string]: any
}

export interface FakeExtensionState {
    globalState?: FakeMementoStorage
    workspaceState?: FakeMementoStorage
}

export class FakeExtensionContext implements vscode.ExtensionContext {
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

    /**
     * Creates a fake `vscode.ExtensionContext` for use in tests.
     *
     *  Disposes any existing `ExtensionDisposableFiles` and creates a new one
     *  with the new `ExtContext`.
     */
    public static async getNew(): Promise<FakeExtensionContext> {
        const ctx = new FakeExtensionContext()
        try {
            TestExtensionDisposableFiles.clearInstance()
        } catch {
            // Ignore.
        }
        await TestExtensionDisposableFiles.initialize(ctx)
        return ctx
    }
}

export class TestExtensionDisposableFiles extends ExtensionDisposableFiles {
    public static ORIGINAL_INSTANCE = ExtensionDisposableFiles.INSTANCE

    public static clearInstance() {
        const instance = ExtensionDisposableFiles.INSTANCE
        ExtensionDisposableFiles.INSTANCE = undefined
        if (instance) {
            del.sync([instance.toolkitTempFolder], { force: true })
            instance.dispose()
        }
    }

    public static resetOriginalInstance() {
        ExtensionDisposableFiles.INSTANCE = TestExtensionDisposableFiles.ORIGINAL_INSTANCE
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
