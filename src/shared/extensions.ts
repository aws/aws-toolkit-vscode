/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from './awsContext'
import { RegionProvider } from './regions/regionProvider'
import { SettingsConfiguration } from './settingsConfiguration'
import { TelemetryService } from './telemetry/telemetryService'
import { ChannelLogger } from './utilities/vsCodeUtils'

export const VSCODE_EXTENSION_ID = {
    awstoolkit: 'amazonwebservices.aws-toolkit-vscode',
    python: 'ms-python.python',
}

/**
 * Long-lived, extension-scoped, shared globals.
 */
export class ExtContext implements vscode.ExtensionContext {
    public asAbsolutePath(relativePath: string): string {
        return this.vscodeContext.asAbsolutePath(relativePath)
    }

    public constructor(
        private readonly vscodeContext: vscode.ExtensionContext,
        public readonly awsContext: AwsContext,
        public readonly regionProvider: RegionProvider,
        public readonly settings: SettingsConfiguration,
        public readonly outputChannel: vscode.OutputChannel,
        public readonly telemetryService: TelemetryService,
        public readonly chanLogger: ChannelLogger,

        //
        // Inherited properties:
        //
        readonly storagePath: string | undefined = vscodeContext.storagePath,
        readonly globalStoragePath: string = vscodeContext.globalStoragePath,
        readonly logPath: string = vscodeContext.logPath,
        readonly subscriptions: { dispose(): any }[] = vscodeContext.subscriptions,
        readonly workspaceState: vscode.Memento = vscodeContext.workspaceState,
        readonly globalState: vscode.Memento = vscodeContext.globalState,
        readonly extensionPath: string = vscodeContext.extensionPath
    ) {}
}
