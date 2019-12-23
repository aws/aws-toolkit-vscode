/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, OutputChannel } from 'vscode'
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
}

export interface IconPaths {
    help: string
    cloudFormation: string
    lambda: string
    settings: string
    registry: string
    schema: string
}

function makeIconPathsObject(): IconPaths {
    return {
        help: '',
        cloudFormation: '',
        lambda: '',
        settings: '',
        registry: '',
        schema: ''
    }
}
