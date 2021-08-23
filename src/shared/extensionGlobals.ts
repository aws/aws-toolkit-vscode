/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, OutputChannel, Uri } from 'vscode'
import { AwsExplorer } from '../awsexplorer/awsExplorer'
import { AWSClientBuilder } from './awsClientBuilder'
import { AWSContextCommands } from './awsContextCommands'
import { ToolkitClientBuilder } from './clients/toolkitClientBuilder'
import { CloudFormationTemplateRegistry } from './cloudformation/templateRegistry'
import { CodelensRootRegistry } from './sam/codelensRootRegistry'
import { TelemetryService } from './telemetry/telemetryService'
import { Window } from './vscode/window'

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext
    export let window: Window
    export let outputChannel: OutputChannel
    export let awsContextCommands: AWSContextCommands
    export let awsExplorer: AwsExplorer
    export let sdkClientBuilder: AWSClientBuilder
    export let toolkitClientBuilder: ToolkitClientBuilder
    export let telemetry: TelemetryService
    export let templateRegistry: CloudFormationTemplateRegistry
    export let codelensRootRegistry: CodelensRootRegistry

    let _didReload = false

    export function init(context: ExtensionContext, window: Window) {
        ext.context = context
        ext.window = window
        _didReload = !!ext.context.globalState.get<string>('ACTIVATION_LAUNCH_PATH_KEY')
    }

    /**
     * Whether the current session was (likely) a reload forced by VSCode
     * during a workspace folder operation.
     */
    export function didReload(): boolean {
        return _didReload
    }

    export namespace iconPaths {
        export const dark: IconPaths = makeIconPathsObject()
        export const light: IconPaths = makeIconPathsObject()
    }

    export namespace visualizationResourcePaths {
        export let localWebviewScriptsPath: Uri
        export let webviewBodyScript: Uri
        export let visualizationLibraryCachePath: Uri
        export let visualizationLibraryScript: Uri
        export let visualizationLibraryCSS: Uri
        export let stateMachineCustomThemePath: Uri
        export let stateMachineCustomThemeCSS: Uri
    }

    export namespace manifestPaths {
        // TODO this is a good example of why we need to remove namespaces,
        // eslint can't detemrine that these are assigned to later
        // eslint-disable-next-line prefer-const
        export let endpoints: string = ''
        // eslint-disable-next-line prefer-const
        export let lambdaSampleRequests: string = ''
    }
}

export interface IconPaths {
    apprunner: string
    statemachine: string
    help: string
    cloudFormation: string
    ecr: string
    lambda: string
    settings: string
    registry: string
    s3: string
    folder: string
    file: string
    schema: string
    cloudWatchLogGroup: string
    bucket: string
    createBucket: string
    // temporary icons while Cloud9 does not have codicon support
    plus: string
    edit: string
}

function makeIconPathsObject(): IconPaths {
    return {
        help: '',
        cloudFormation: '',
        ecr: '',
        lambda: '',
        settings: '',
        registry: '',
        s3: '',
        folder: '',
        file: '',
        schema: '',
        apprunner: '',
        statemachine: '',
        cloudWatchLogGroup: '',
        bucket: '',
        createBucket: '',
        plus: '',
        edit: '',
    }
}
