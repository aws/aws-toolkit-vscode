/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, OutputChannel, Uri } from 'vscode'
import { LoginManager } from '../credentials/loginManager'
import { AwsResourceManager } from '../dynamicResources/awsResourceManager'
import { AWSClientBuilder } from './awsClientBuilder'
import { AwsContext, DefaultAwsContext } from './awsContext'
import { AwsContextCommands } from './awsContextCommands'
import { RegionProvider } from './regions/regionProvider'
import { CloudFormationTemplateRegistry } from './fs/templateRegistry'
import { CodelensRootRegistry } from './fs/codelensRootRegistry'
import { SchemaService } from './schemas'
import { TelemetryLogger } from './telemetry/telemetryLogger'
import { TelemetryService } from './telemetry/telemetryService'
import { UriHandler } from './vscode/uriHandler'

type Clock = Pick<
    typeof globalThis,
    'setTimeout' | 'setImmediate' | 'setInterval' | 'clearTimeout' | 'clearImmediate' | 'clearInterval' | 'Date'
>

/**
 * Copies all *enumerable* properties from the global object.
 * Some properties have to be added manually depending on how they exist on the prototype.
 */
function copyClock(): Clock {
    return { ...globalThis, Date, Promise } as Clock
}

const globals = { clock: copyClock() } as ToolkitGlobals

export function checkDidReload(context: ExtensionContext): boolean {
    return !!context.globalState.get<string>('ACTIVATION_LAUNCH_PATH_KEY')
}

export function initialize(context: ExtensionContext): ToolkitGlobals {
    Object.assign(globals, {
        context,
        clock: copyClock(),
        didReload: checkDidReload(context),
        manifestPaths: {} as ToolkitGlobals['manifestPaths'],
        visualizationResourcePaths: {} as ToolkitGlobals['visualizationResourcePaths'],
        awsContext: new DefaultAwsContext(),
    })

    return globals
}

export default globals

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
interface ToolkitGlobals {
    readonly context: ExtensionContext
    // TODO: make the rest of these readonly (or delete them)
    outputChannel: OutputChannel
    loginManager: LoginManager
    awsContextCommands: AwsContextCommands
    awsContext: AwsContext
    regionProvider: RegionProvider
    sdkClientBuilder: AWSClientBuilder
    telemetry: TelemetryService & { logger: TelemetryLogger }
    templateRegistry: CloudFormationTemplateRegistry
    schemaService: SchemaService
    codelensRootRegistry: CodelensRootRegistry
    resourceManager: AwsResourceManager
    uriHandler: UriHandler

    /**
     * Whether the current session was (likely) a reload forced by VSCode during a workspace folder operation.
     */
    readonly didReload: boolean

    /**
     * This is a shallow copy of the global `this` object.
     *
     * Using a separate clock from the global one allows us to scope down behavior for testing.
     * Keep in mind that this clock's `Date` constructor will be different than the global one when mocked.
     */
    readonly clock: Clock

    visualizationResourcePaths: {
        localWebviewScriptsPath: Uri
        webviewBodyScript: Uri
        visualizationLibraryCachePath: Uri
        visualizationLibraryScript: Uri
        visualizationLibraryCSS: Uri
        stateMachineCustomThemePath: Uri
        stateMachineCustomThemeCSS: Uri
    }

    readonly manifestPaths: {
        endpoints: string
        lambdaSampleRequests: string
    }
}
