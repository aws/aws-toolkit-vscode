/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Memento } from 'vscode'
import { ExtContext } from '../shared/extensions'
import { AwsContext } from '../shared/awsContext'
import { FakeAwsContext, FakeRegionProvider } from './utilities/fakeAwsContext'
import { RegionProvider } from '../shared/regions/regionProvider'
import { SettingsConfiguration, DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import { TelemetryService } from '../shared/telemetry/telemetryService'
import { MockOutputChannel } from './mockOutputChannel'
import { DefaultTelemetryService } from '../shared/telemetry/defaultTelemetryService'
import { FakeTelemetryPublisher } from './fake/fakeTelemetryService'
import { FakeChannelLogger } from './shared/fakeChannelLogger'
import { ChannelLogger } from '../shared/utilities/vsCodeUtils'
import { ExtensionDisposableFiles } from '../shared/utilities/disposableFiles'

export interface FakeMementoStorage {
    [key: string]: any
}

export interface FakeExtensionState {
    globalState?: FakeMementoStorage
    workspaceState?: FakeMementoStorage
}

export class FakeExtensionContext implements ExtContext {
    public subscriptions: {
        dispose(): any
    }[] = []
    public workspaceState: Memento = new FakeMemento()
    public globalState: Memento = new FakeMemento()
    public storagePath: string | undefined
    public globalStoragePath: string = '.'
    public logPath: string = ''
    public awsContext: AwsContext = new FakeAwsContext()
    public regionProvider: RegionProvider = new FakeRegionProvider()
    public settings: SettingsConfiguration = new DefaultSettingsConfiguration('aws')
    public outputChannel = new MockOutputChannel()
    public telemetryService: TelemetryService
    public chanLogger: ChannelLogger

    private _extensionPath: string = ''

    public constructor(preload?: FakeExtensionState) {
        if (preload) {
            this.globalState = new FakeMemento(preload.globalState)
            this.workspaceState = new FakeMemento(preload.workspaceState)
        }
        this.chanLogger = new FakeChannelLogger()
        const fakeTelemetryPublisher = new FakeTelemetryPublisher()
        this.telemetryService = new DefaultTelemetryService(this, this.awsContext, fakeTelemetryPublisher)
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
