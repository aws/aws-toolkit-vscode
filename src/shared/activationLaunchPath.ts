/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from './extensionGlobals'

const ACTIVATION_LAUNCH_PATH_KEY = 'ACTIVATION_LAUNCH_PATH_KEY'

/**
 * Manages a setting to represent what path should be opened on extension activation.
 */
export class ActivationLaunchPath {
    public getLaunchPath(): string | undefined {
        return this.extensionContext.globalState.get<string>(ACTIVATION_LAUNCH_PATH_KEY)
    }

    public setLaunchPath(path: string): void {
        this.extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, path)
    }

    public clearLaunchPath(): void {
        this.extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, undefined)
    }

    protected get extensionContext(): vscode.ExtensionContext {
        return ext.context
    }
}
