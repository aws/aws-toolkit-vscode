/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { ExtensionContext, OutputChannel, Uri } from 'vscode'
import { AwsResourceManager } from '../dynamicResources/awsResourceManager'
import { initializeIconPaths } from '../test/shared/utilities/iconPathUtils'
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

function initializeManifestPaths(context: ExtensionContext): typeof ext['manifestPaths'] {
    return {
        endpoints: context.asAbsolutePath(path.join('resources', 'endpoints.json')),
        lambdaSampleRequests: context.asAbsolutePath(path.join('resources', 'vs-lambda-sample-request-manifest.xml')),
    }
}

export function checkDidReload(context: ExtensionContext): boolean {
    return !!context.globalState.get<string>('ACTIVATION_LAUNCH_PATH_KEY')
}

/**
 * Initializes the global `ext` object and assigns it.
 */
export function initializeExt(context: ExtensionContext, window: Window): typeof ext {
    // TODO: we should throw here if already assigned. A few tests actually depend on the combined state
    // of the extension activating plus test setup, so for now we have to do it like this :(
    return (globalThis.ext = {
        context,
        window,
        clock: copyClock(),
        didReload: checkDidReload(context),
        iconPaths: initializeIconPaths(context),
        manifestPaths: initializeManifestPaths(context),
        visualizationResourcePaths: {}, // TODO: initialize here instead of wherever else
    } as typeof ext) // Need to cast for now until we can move more of the initialization to one place
}

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
declare global {
    namespace ext {
        // TODO: change these all to constants
        let context: ExtensionContext
        let window: Window
        let outputChannel: OutputChannel
        let awsContextCommands: AWSContextCommands
        let awsContext: AwsContext
        let regionProvider: RegionProvider
        let sdkClientBuilder: AWSClientBuilder
        let toolkitClientBuilder: ToolkitClientBuilder
        let telemetry: TelemetryService
        let templateRegistry: CloudFormationTemplateRegistry
        let schemaService: SchemaService
        let codelensRootRegistry: CodelensRootRegistry
        let resourceManager: AwsResourceManager

        /**
         * Whether the current session was (likely) a reload forced by VSCode during a workspace folder operation.
         */
        const didReload: boolean

        /**
         * This is a 'copy' of the global `this` object.
         *
         * Using a separate clock from the global one allows us to scope down behavior for testing.
         * This is not perfect but it's better than the alternative of trying to cobble together mocks with the real thing.
         * Keep in mind that this clock's `Date` constructor will be different than the global one when mocked.
         */
        const clock: Clock

        namespace iconPaths {
            const dark: IconPaths
            const light: IconPaths
        }

        namespace visualizationResourcePaths {
            let localWebviewScriptsPath: Uri
            let webviewBodyScript: Uri
            let visualizationLibraryCachePath: Uri
            let visualizationLibraryScript: Uri
            let visualizationLibraryCSS: Uri
            let stateMachineCustomThemePath: Uri
            let stateMachineCustomThemeCSS: Uri
        }

        namespace manifestPaths {
            let endpoints: string
            let lambdaSampleRequests: string
        }
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
