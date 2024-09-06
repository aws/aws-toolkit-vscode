/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import globals from './extensionGlobals'

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
            template: globals.globalState.get<string>('ACTIVATION_TEMPLATE_PATH_KEY'),
            readme: globals.globalState.get<string>('ACTIVATION_LAUNCH_PATH_KEY'),
            runtime: globals.globalState.get<string>('SAM_INIT_RUNTIME_KEY'),
            architecture: globals.globalState.get<string>('SAM_INIT_ARCH_KEY'),
            isImage: globals.globalState.get<boolean>('SAM_INIT_IMAGE_BOOLEAN_KEY'),
        }
    }

    public setSamInitState(state: SamInitState): void {
        void globals.globalState.update('ACTIVATION_TEMPLATE_PATH_KEY', state.template)
        void globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', state.readme)
        void globals.globalState.update('SAM_INIT_RUNTIME_KEY', state.runtime)
        void globals.globalState.update('SAM_INIT_ARCH_KEY', state.architecture)
        void globals.globalState.update('SAM_INIT_IMAGE_BOOLEAN_KEY', state.isImage)
    }

    public clearSamInitState(): void {
        void globals.globalState.update('ACTIVATION_TEMPLATE_PATH_KEY', undefined)
        void globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', undefined)
        void globals.globalState.update('SAM_INIT_RUNTIME_KEY', undefined)
        void globals.globalState.update('SAM_INIT_ARCH_KEY', undefined)
        void globals.globalState.update('SAM_INIT_IMAGE_BOOLEAN_KEY', undefined)
    }
}
