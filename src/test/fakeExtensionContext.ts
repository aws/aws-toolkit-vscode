/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Memento } from 'vscode'
import { ExtContext } from '../shared/extensions'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import { DefaultTelemetryService } from '../shared/telemetry/defaultTelemetryService'
import { TelemetryService } from '../shared/telemetry/telemetryService'
import { ExtensionDisposableFiles } from '../shared/utilities/disposableFiles'
import { FakeTelemetryPublisher } from './fake/fakeTelemetryService'
import { MockOutputChannel } from './mockOutputChannel'
import { FakeChannelLogger } from './shared/fakeChannelLogger'
import { FakeAwsContext, FakeRegionProvider } from './utilities/fakeAwsContext'

export interface FakeMementoStorage {
    [key: string]: any
}

export interface FakeExtensionState {
    globalState?: FakeMementoStorage
    workspaceState?: FakeMementoStorage
}

export class FakeExtensionContext extends ExtContext {
    private _extensionPath: string = ''
    private _telemetryService: TelemetryService | undefined

    public constructor(
        // Test-related parameters:
        preload?: FakeExtensionState,

        //
        // Inherited properties:
        //
        public readonly storagePath: string | undefined = '',
        public readonly globalStoragePath: string = '.',
        public readonly logPath: string = '',
        public readonly subscriptions: { dispose(): any }[] = [],
        public readonly workspaceState: Memento = preload ? new FakeMemento(preload.workspaceState) : new FakeMemento(),
        public readonly globalState: Memento = preload ? new FakeMemento(preload.globalState) : new FakeMemento()
    ) {
        super(
            // Cannot pass `this` here, but we need a `vscode.ExtensionContext`.
            // Hack around the type system here, then fill the properties after the super() call.
            ({
                storagePath: '',
                globalStoragePath: '.',
                logPath: '',
                subscriptions: [],
                workspaceState: new FakeMemento(),
                globalState: new FakeMemento(),
            } as unknown) as ExtContext,
            new FakeAwsContext(),
            new FakeRegionProvider(),
            new DefaultSettingsConfiguration('aws'),
            new MockOutputChannel(),
            {} as TelemetryService,
            new FakeChannelLogger()
        )
        const fakeTelemetryPublisher = new FakeTelemetryPublisher()
        this.telemetryService = new DefaultTelemetryService(this, this.awsContext, fakeTelemetryPublisher)
    }

    public get telemetryService(): TelemetryService {
        return this._telemetryService!
    }

    public set telemetryService(t: TelemetryService) {
        this._telemetryService = t
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
     * Creates a new `ExtContext` for use in tests.
     *
     *  Disposes any existing `ExtensionDisposableFiles` and creates a new one
     *  with the new `ExtContext`.
     */
    public static async getNew(): Promise<FakeExtensionContext> {
        const ctx = new FakeExtensionContext()
        try {
            ExtensionDisposableFiles.getInstance().dispose()
        } catch {
            await ExtensionDisposableFiles.initialize(ctx)
        }
        return ctx
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
