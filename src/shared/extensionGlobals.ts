/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, OutputChannel, Uri } from 'vscode'
import { AWSClientBuilder } from './awsClientBuilder'
import { AWSContextCommands } from './awsContextCommands'
import { ToolkitClientBuilder } from './clients/toolkitClientBuilder'
import { TelemetryService } from './telemetry/telemetryService'

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext
    export let outputChannel: OutputChannel
    export let lambdaOutputChannel: OutputChannel
    export let awsContextCommands: AWSContextCommands
    export let sdkClientBuilder: AWSClientBuilder
    export let toolkitClientBuilder: ToolkitClientBuilder
    export let telemetry: TelemetryService

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
        export let endpoints: string = ''
        export let lambdaSampleRequests: string = ''
    }
}

export interface IconPaths {
    statemachine: string
    help: string
    cloudFormation: string
    lambda: string
    settings: string
    registry: string
    schema: string
    cloudWatchLogGroup: string
}

function makeIconPathsObject(): IconPaths {
    return {
        help: '',
        cloudFormation: '',
        lambda: '',
        settings: '',
        registry: '',
        schema: '',
        statemachine: '',
        cloudWatchLogGroup: '',
    }
}
