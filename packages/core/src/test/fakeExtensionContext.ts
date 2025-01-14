/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { CredentialsStore } from '../auth/credentials/store'
import { ExtContext } from '../shared/extensions'
import { SamCliContext } from '../shared/sam/cli/samCliContext'
import {
    minSamCliVersion,
    minSamCliVersionForGoSupport,
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../shared/sam/cli/samCliValidator'
import { DefaultTelemetryService } from '../shared/telemetry/telemetryService'
import { ChildProcessResult } from '../shared/utilities/processUtils'
import { UriHandler } from '../shared/vscode/uriHandler'
import { FakeTelemetryPublisher } from './fake/fakeTelemetryService'
import { MockOutputChannel } from './mockOutputChannel'
import { FakeChildProcessResult, TestSamCliProcessInvoker } from './shared/sam/cli/testSamCliProcessInvoker'
import { createTestWorkspaceFolder } from './testUtil'
import { FakeAwsContext } from './utilities/fakeAwsContext'
import { createTestRegionProvider } from './shared/regions/testUtil'
import fs from '../shared/fs/fs'

export interface FakeMementoStorage {
    [key: string]: any
}

export interface FakeExtensionState {
    globalState?: FakeMementoStorage
    workspaceState?: FakeMementoStorage
}

export class FakeExtensionContext implements vscode.ExtensionContext {
    // Seems to be the most reliable way to set the extension path (unfortunately)
    // TODO: figure out a robust way to source the project directory that is invariant to entry point
    // Using `package.json` as a reference point seems to make the most sense
    private _extensionPath: string = path.resolve(__dirname, '../../..')
    private _globalStoragePath: string = '.'

    public subscriptions: {
        dispose(): any
    }[] = []
    public workspaceState: vscode.Memento = new FakeMemento()
    public globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } = new FakeMemento()
    public globalStorageUri: vscode.Uri = vscode.Uri.file('file://fake/storage/uri')
    public storagePath: string | undefined
    public logPath: string = ''
    public extensionUri: vscode.Uri = vscode.Uri.file(this._extensionPath)
    public environmentVariableCollection: any // vscode.EnvironmentVariableCollection = {} as vscode.EnvironmentVariableCollection
    public storageUri: vscode.Uri | undefined
    public logUri: vscode.Uri = vscode.Uri.file('file://fake/log/uri')
    public extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Test
    public secrets = new FakeSecretStorage()

    public extension: vscode.Extension<any> = {
        activate: async () => undefined,
        exports: undefined,
        extensionKind: vscode.ExtensionKind.Workspace,
        extensionPath: '/fake/extension',
        extensionUri: vscode.Uri.file('/fake/extension/dir/'),
        id: 'aws.toolkit.fake.extension',
        isActive: true,
        packageJSON: {},
    }

    /**
     * Use {@link create()} to create a FakeExtensionContext.
     */
    private constructor(preload?: FakeExtensionState) {
        if (preload) {
            // eslint-disable-next-line aws-toolkits/no-banned-usages
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
        return path.resolve(this._extensionPath, relativePath)
    }

    /**
     * Creates a fake `vscode.ExtensionContext` for use in tests.
     */
    public static async create(preload?: FakeExtensionState): Promise<FakeExtensionContext> {
        const ctx = new FakeExtensionContext(preload)
        const folder = await createTestWorkspaceFolder('test')
        ctx.globalStorageUri = vscode.Uri.joinPath(folder.uri, 'globalStorage')
        ctx.logUri = vscode.Uri.joinPath(folder.uri, 'logs')
        await fs.mkdir(ctx.globalStorageUri.fsPath)
        await fs.mkdir(ctx.logUri.fsPath)
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
                invoker: new TestSamCliProcessInvoker((_spawnOptions, _args: any[]): ChildProcessResult => {
                    return new FakeChildProcessResult({})
                }),
                validator: new FakeSamCliValidator(minSamCliVersionForGoSupport),
            } as SamCliContext
        }
        const regionProvider = createTestRegionProvider({ awsContext })
        const outputChannel = new MockOutputChannel()
        const fakeTelemetryPublisher = new FakeTelemetryPublisher()
        const telemetryService = await DefaultTelemetryService.create(awsContext, undefined, fakeTelemetryPublisher)

        return {
            extensionContext: ctx,
            awsContext,
            samCliContext,
            regionProvider,
            outputChannel,
            telemetryService,
            credentialsStore: new CredentialsStore(),
            uriHandler: new UriHandler(),
        }
    }
}

export class FakeMemento implements vscode.Memento {
    public constructor(private readonly _storage: FakeMementoStorage = {}) {}
    public setKeysForSync(_keys: readonly string[]): void {
        // TODO(jmkeyes): implement this?
    }
    public keys(): readonly string[] {
        return Object.keys(this._storage)
    }
    public get<T>(key: string): T | undefined
    public get<T>(key: string, defaultValue: T): T
    public get(key: string, defaultValue?: unknown) {
        return this._storage[key] ?? defaultValue
    }
    public update(key: string, value: any): Thenable<void> {
        /** From the docs of {@link vscode.Memento.update*()} if a value is updated to undefined, it should be deleted */
        if (value === undefined) {
            delete this._storage[key]
            return Promise.resolve()
        }

        this._storage[key] = value

        return Promise.resolve()
    }
}

export class FakeSecretStorage implements vscode.SecretStorage {
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
    public constructor(version: string = minSamCliVersion) {
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
