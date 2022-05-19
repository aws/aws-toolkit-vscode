/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirp } from 'fs-extra'
import * as vscode from 'vscode'
import { CredentialsStore } from '../credentials/credentialsStore'
import { ExtContext } from '../shared/extensions'
import { SamCliContext } from '../shared/sam/cli/samCliContext'
import {
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_GO_SUPPORT,
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../shared/sam/cli/samCliValidator'
import { DefaultTelemetryService } from '../shared/telemetry/telemetryService'
import { ChildProcessResult } from '../shared/utilities/childProcess'
import { FakeEnvironmentVariableCollection } from './fake/fakeEnvironmentVariableCollection'
import { FakeTelemetryPublisher } from './fake/fakeTelemetryService'
import { MockOutputChannel } from './mockOutputChannel'
import { FakeChildProcessResult, TestSamCliProcessInvoker } from './shared/sam/cli/testSamCliProcessInvoker'
import { createTestWorkspaceFolder } from './testUtil'
import { FakeAwsContext, FakeRegionProvider } from './utilities/fakeAwsContext'

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
    public workspaceState: vscode.Memento = new FakeMemento()
    public globalState: vscode.Memento = new FakeMemento()
    public globalStorageUri: vscode.Uri = vscode.Uri.file('file://fake/storage/uri')
    public storagePath: string | undefined
    public logPath: string = ''
    public extensionUri: vscode.Uri = vscode.Uri.file('file://fake/extension/uri')
    public environmentVariableCollection: vscode.EnvironmentVariableCollection = new FakeEnvironmentVariableCollection()
    public storageUri: vscode.Uri | undefined
    public logUri: vscode.Uri = vscode.Uri.file('file://fake/log/uri')
    public extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Test
    public secrets = new SecretStorage()

    private _extensionPath: string = ''
    private _globalStoragePath: string = '.'

    /**
     * Use {@link create()} to create a FakeExtensionContext.
     */
    private constructor(preload?: FakeExtensionState) {
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

    public get globalStoragePath(): string {
        return this._globalStoragePath
    }

    public set globalStoragePath(path: string) {
        this._globalStoragePath = path
    }

    public asAbsolutePath(relativePath: string): string {
        return relativePath
    }

    /**
     * Creates a fake `vscode.ExtensionContext` for use in tests.
     */
    public static async create(preload?: FakeExtensionState): Promise<FakeExtensionContext> {
        const ctx = new FakeExtensionContext(preload)
        const folder = await createTestWorkspaceFolder('test')
        ctx.globalStorageUri = vscode.Uri.joinPath(folder.uri, 'globalStorage')
        ctx.logUri = vscode.Uri.joinPath(folder.uri, 'logs')
        await mkdirp(ctx.globalStorageUri.fsPath)
        await mkdirp(ctx.logUri.fsPath)
        return ctx
    }

    /**
     * Creates a fake `ExtContext` for use in tests.
     */
    public static async getFakeExtContext(): Promise<ExtContext> {
        const ctx = await FakeExtensionContext.create()
        const awsContext = new FakeAwsContext()
        const samCliContext = () => {
            return {
                invoker: new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
                    return new FakeChildProcessResult({})
                }),
                validator: new FakeSamCliValidator(MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_GO_SUPPORT),
            } as SamCliContext
        }
        const regionProvider = new FakeRegionProvider()
        const outputChannel = new MockOutputChannel()
        const invokeOutputChannel = new MockOutputChannel()
        const fakeTelemetryPublisher = new FakeTelemetryPublisher()
        const telemetryService = new DefaultTelemetryService(ctx, awsContext, undefined, fakeTelemetryPublisher)
        return {
            extensionContext: ctx,
            awsContext,
            samCliContext,
            regionProvider,
            outputChannel,
            invokeOutputChannel,
            telemetryService,
            credentialsStore: new CredentialsStore(),
        }
    }
}

class FakeMemento implements vscode.Memento {
    public constructor(private readonly _storage: FakeMementoStorage = {}) {}
    public get<T>(key: string): T | undefined
    public get<T>(key: string, defaultValue: T): T
    public get(key: any, defaultValue?: any) {
        if (Object.prototype.hasOwnProperty.call(this._storage, String(key))) {
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

class SecretStorage implements vscode.SecretStorage {
    private _onDidChange = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
    public readonly onDidChange = this._onDidChange.event

    public constructor(private readonly storage: Record<string, string> = {}) {}

    public async get(key: string): Promise<string | undefined> {
        return this.storage[key]
    }

    public async store(key: string, value: string): Promise<void> {
        this.storage[key] = value
        this._onDidChange.fire({ key })
    }

    public async delete(key: string): Promise<void> {
        delete this.storage[key]
        this._onDidChange.fire({ key })
    }
}

export class FakeSamCliValidator implements SamCliValidator {
    private readonly version: string
    public constructor(version: string = MINIMUM_SAM_CLI_VERSION_INCLUSIVE) {
        this.version = version
    }
    public async detectValidSamCli(): Promise<SamCliValidatorResult> {
        return {
            samCliFound: true,
            versionValidation: {
                version: this.version,
                validation: SamCliVersionValidation.Valid,
            },
        }
    }

    public async getVersionValidatorResult(): Promise<SamCliVersionValidatorResult> {
        return { validation: SamCliVersionValidation.VersionNotParseable }
    }
}
