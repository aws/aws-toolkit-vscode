/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CredentialsStore } from '../credentials/credentialsStore'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import { DefaultTelemetryService } from '../shared/telemetry/defaultTelemetryService'
import { ExtContext } from '../shared/extensions'
import { FakeAwsContext, FakeRegionProvider } from './utilities/fakeAwsContext'
import { FakeTelemetryPublisher } from './fake/fakeTelemetryService'
import { MockOutputChannel } from './mockOutputChannel'
import { SamCliContext } from '../shared/sam/cli/samCliContext'
import {
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_GO_SUPPORT,
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../shared/sam/cli/samCliValidator'
import { FakeChildProcessResult, TestSamCliProcessInvoker } from './shared/sam/cli/testSamCliProcessInvoker'
import { ChildProcessResult } from '../shared/utilities/childProcess'

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
     */
    public static async getNew(): Promise<FakeExtensionContext> {
        const ctx = new FakeExtensionContext()
        return ctx
    }

    /**
     * Creates a fake `ExtContext` for use in tests.
     */
    public static async getFakeExtContext(): Promise<ExtContext> {
        const ctx = await FakeExtensionContext.getNew()
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
        const settings = new DefaultSettingsConfiguration('aws')
        const outputChannel = new MockOutputChannel()
        const fakeTelemetryPublisher = new FakeTelemetryPublisher()
        const telemetryService = new DefaultTelemetryService(ctx, awsContext, undefined, fakeTelemetryPublisher)
        return {
            extensionContext: ctx,
            awsContext: awsContext,
            samCliContext: samCliContext,
            regionProvider: regionProvider,
            settings: settings,
            outputChannel: outputChannel,
            telemetryService: telemetryService,
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
