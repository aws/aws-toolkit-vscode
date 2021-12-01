/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, OutputChannel, Uri } from 'vscode'
import { AwsResourceManager } from '../dynamicResources/awsResourceManager'
import { AWSClientBuilder } from './awsClientBuilder'
import { AwsContext } from './awsContext'
import { AWSContextCommands } from './awsContextCommands'
import { ToolkitClientBuilder } from './clients/toolkitClientBuilder'
import { CloudFormationTemplateRegistry } from './cloudformation/templateRegistry'
import { RegionProvider } from './regions/regionProvider'
import { CodelensRootRegistry } from './sam/codelensRootRegistry'
import { SchemaService } from './schemas'
import { TelemetryService } from './telemetry/telemetryService'
import { Window } from './vscode/window'

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

const globals = {} as ToolkitGlobals

export function checkDidReload(context: ExtensionContext): boolean {
    return !!context.globalState.get<string>('ACTIVATION_LAUNCH_PATH_KEY')
}

export function initialize(context: ExtensionContext, window: Window): ToolkitGlobals {
    // TODO: we should throw here if already assigned. A few tests actually depend on the combined state
    // of the extension activating plus test setup, so for now we have to do it like this :(

    Object.assign(globals, {
        context,
        window,
        clock: copyClock(),
        didReload: checkDidReload(context),
        iconPaths: { dark: {}, light: {} } as ToolkitGlobals['iconPaths'],
        manifestPaths: {} as ToolkitGlobals['manifestPaths'],
        visualizationResourcePaths: {} as ToolkitGlobals['visualizationResourcePaths'],
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
    readonly window: Window
    // TODO: make the rest of these readonly
    outputChannel: OutputChannel
    awsContextCommands: AWSContextCommands
    awsContext: AwsContext
    regionProvider: RegionProvider
    sdkClientBuilder: AWSClientBuilder
    toolkitClientBuilder: ToolkitClientBuilder
    telemetry: TelemetryService
    templateRegistry: CloudFormationTemplateRegistry
    schemaService: SchemaService
    codelensRootRegistry: CodelensRootRegistry
    resourceManager: AwsResourceManager

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

    readonly iconPaths: {
        readonly dark: IconPaths
        readonly light: IconPaths
    }

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
    thing: string
    certificate: string
    policy: string
    cluster: string
    service: string
    container: string
    // temporary icons while Cloud9 does not have codicon support
    plus: string
    edit: string
    exit: string
    sync: string
    syncIgnore: string
    refresh: string
}
