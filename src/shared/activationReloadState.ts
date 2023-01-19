/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Runtime } from 'aws-sdk/clients/lambda'
import globals from './extensionGlobals'

export const activationTemplatePathKey = 'ACTIVATION_TEMPLATE_PATH_KEY'
export const activationLaunchPathKey = 'ACTIVATION_LAUNCH_PATH_KEY'
export const samInitRuntimeKey = 'SAM_INIT_RUNTIME_KEY'
export const samInitImageBooleanKey = 'SAM_INIT_IMAGE_BOOLEAN_KEY'
export const samInitArchKey = 'SAM_INIT_ARCH_KEY'

export interface SamInitState {
    template: string | undefined
    readme: string | undefined
    runtime: Runtime | undefined
    architecture: string | undefined
    isImage: boolean | undefined
}

/**
 * Manages state that needs to be persisted across extension restart to workflows that mutate the workspace.
 */
export class ActivationReloadState {
    public getSamInitState(): SamInitState | undefined {
        return {
            template: this.extensionContext.globalState.get<string>(activationTemplatePathKey),
            readme: this.extensionContext.globalState.get<string>(activationLaunchPathKey),
            runtime: this.extensionContext.globalState.get<string>(samInitRuntimeKey),
            architecture: this.extensionContext.globalState.get<string>(samInitArchKey),
            isImage: this.extensionContext.globalState.get<boolean>(samInitImageBooleanKey),
        }
    }

    public setSamInitState(state: SamInitState): void {
        this.extensionContext.globalState.update(activationTemplatePathKey, state.template)
        this.extensionContext.globalState.update(activationLaunchPathKey, state.readme)
        this.extensionContext.globalState.update(samInitRuntimeKey, state.runtime)
        this.extensionContext.globalState.update(samInitArchKey, state.architecture)
        this.extensionContext.globalState.update(samInitImageBooleanKey, state.isImage)
    }

    public clearSamInitState(): void {
        this.extensionContext.globalState.update(activationTemplatePathKey, undefined)
        this.extensionContext.globalState.update(activationLaunchPathKey, undefined)
        this.extensionContext.globalState.update(samInitRuntimeKey, undefined)
        this.extensionContext.globalState.update(samInitArchKey, undefined)
        this.extensionContext.globalState.update(samInitImageBooleanKey, undefined)
    }

    protected get extensionContext(): vscode.ExtensionContext {
        return globals.context
    }
}
