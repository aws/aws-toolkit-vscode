/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from './extensionGlobals'
import { Runtime } from 'aws-sdk/clients/lambda'

export const ACTIVATION_LAUNCH_PATH_KEY = 'ACTIVATION_LAUNCH_PATH_KEY'
export const SAM_INIT_IMAGE_RUNTIME_KEY = 'SAM_INIT_IMAGE_RUNTIME_KEY'

export interface SamInitState {
    path: string | undefined
    imageRuntime: Runtime | undefined
}

/**
 * Manages state that needs to be persisted across extension restart to workflows that mutate the workspace.
 */
export class ActivationReloadState {
    public getSamInitState(): SamInitState | undefined {
        const activationPath = this.extensionContext.globalState.get<string>(ACTIVATION_LAUNCH_PATH_KEY)

        return activationPath
            ? {
                  path: activationPath,
                  imageRuntime: this.extensionContext.globalState.get<string>(SAM_INIT_IMAGE_RUNTIME_KEY),
              }
            : undefined
    }

    public setSamInitState(state: SamInitState): void {
        this.extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, state.path)
        this.extensionContext.globalState.update(SAM_INIT_IMAGE_RUNTIME_KEY, state.imageRuntime)
    }

    public clearSamInitState(): void {
        this.extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, undefined)
        this.extensionContext.globalState.update(SAM_INIT_IMAGE_RUNTIME_KEY, undefined)
    }

    protected get extensionContext(): vscode.ExtensionContext {
        return ext.context
    }
}
