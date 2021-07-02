/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from './extensionGlobals'
import { Runtime } from 'aws-sdk/clients/lambda'

export const ACTIVATION_TEMPLATE_PATH_KEY = 'ACTIVATION_TEMPLATE_PATH_KEY'
export const ACTIVATION_LAUNCH_PATH_KEY = 'ACTIVATION_LAUNCH_PATH_KEY'
export const SAM_INIT_RUNTIME_KEY = 'SAM_INIT_RUNTIME_KEY'
export const SAM_INIT_IMAGE_BOOLEAN_KEY = 'SAM_INIT_IMAGE_BOOLEAN_KEY'

export interface SamInitState {
    template: string | undefined
    readme: string | undefined
    runtime: Runtime | undefined
    isImage: boolean | undefined
}

/**
 * Manages state that needs to be persisted across extension restart to workflows that mutate the workspace.
 */
export class ActivationReloadState {
    public getSamInitState(): SamInitState | undefined {
        return {
            template: this.extensionContext.globalState.get<string>(ACTIVATION_TEMPLATE_PATH_KEY),
            readme: this.extensionContext.globalState.get<string>(ACTIVATION_LAUNCH_PATH_KEY),
            runtime: this.extensionContext.globalState.get<string>(SAM_INIT_RUNTIME_KEY),
            isImage: this.extensionContext.globalState.get<boolean>(SAM_INIT_IMAGE_BOOLEAN_KEY),
        }
    }

    public setSamInitState(state: SamInitState): void {
        this.extensionContext.globalState.update(ACTIVATION_TEMPLATE_PATH_KEY, state.template)
        this.extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, state.readme)
        this.extensionContext.globalState.update(SAM_INIT_RUNTIME_KEY, state.runtime)
        this.extensionContext.globalState.update(SAM_INIT_IMAGE_BOOLEAN_KEY, state.isImage)
    }

    public clearSamInitState(): void {
        this.extensionContext.globalState.update(ACTIVATION_TEMPLATE_PATH_KEY, undefined)
        this.extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, undefined)
        this.extensionContext.globalState.update(SAM_INIT_RUNTIME_KEY, undefined)
        this.extensionContext.globalState.update(SAM_INIT_IMAGE_BOOLEAN_KEY, undefined)
    }

    protected get extensionContext(): vscode.ExtensionContext {
        return ext.context
    }
}
