/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, OutputChannel, Uri } from 'vscode'
import { LoginManager } from '../auth/deprecated/loginManager'
import { AwsResourceManager } from '../dynamicResources/awsResourceManager'
import { AWSClientBuilder } from './awsClientBuilder'
import { AwsContext } from './awsContext'
import { AwsContextCommands } from './awsContextCommands'
import { RegionProvider } from './regions/regionProvider'
import { CloudFormationTemplateRegistry } from './fs/templateRegistry'
import { CodelensRootRegistry } from './fs/codelensRootRegistry'
import { SchemaService } from './schemas'
import { TelemetryLogger } from './telemetry/telemetryLogger'
import { TelemetryService } from './telemetry/telemetryService'
import { UriHandler } from './vscode/uriHandler'
import vscode from 'vscode'

type Clock = Pick<
    typeof globalThis,
    | 'setTimeout'
    | 'setImmediate'
    | 'setInterval'
    | 'clearTimeout'
    | 'clearImmediate'
    | 'clearInterval'
    | 'Date'
    | 'Promise'
>

/**
 * Copies all *enumerable* properties from the global object.
 * Some properties have to be added manually depending on how they exist on the prototype.
 */
function copyClock(): Clock {
    const clock: any = {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        setInterval: globalThis.setInterval.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis),
        Date,
        Promise,
    }

    const browserAlternatives = getBrowserAlternatives()
    if (Object.keys(browserAlternatives).length > 0) {
        console.log('globals: Using browser alternatives for clock functions')
        Object.assign(clock, browserAlternatives)
    } else {
        // In node.js context
        clock.setImmediate = globalThis.setImmediate.bind(globalThis)
        clock.clearImmediate = globalThis.clearImmediate.bind(globalThis)
    }

    return clock
}

/**
 * If we are in browser certain functions are not available, so
 * we create alternatives for them.
 */
function getBrowserAlternatives() {
    const alternatives = {} as any
    if (globalThis.setImmediate === undefined) {
        // "A setTimeout() callback with a 0ms delay is very similar to setImmediate()"
        // https://nodejs.dev/en/learn/understanding-setimmediate/
        alternatives['setImmediate'] = (callback: (...args: any[]) => void, ...args: any[]) => {
            return globalThis.setTimeout(callback, 0, ...args)
        }
        alternatives['clearImmediate'] = (handle: any) => {
            globalThis.clearTimeout(handle)
        }
    }
    return alternatives
}

/**
 * XXX: Web-mode tests (as opposed to Node.js tests) don't see changes to exported module variables.
 *
 * Workaround: store variables in `globalThis` so that web-mode tests can share them.
 *
 * See `web.md` for more info.
 *
 * Note: The returned globals is shared across all extensions/the entire VS Code instance.
 *
 */
function resolveGlobalsObject(): ToolkitGlobals {
    if ((globalThis as any).globals === undefined) {
        ;(globalThis as any).globals = { clock: copyClock() } as ToolkitGlobals
    }
    return (globalThis as any).globals
}

/**
 * Throw a more intuitive error if any code tries to use `globals` before `initialize()` was called.
 */
function proxyGlobals(globals_: ToolkitGlobals): ToolkitGlobals {
    return new Proxy(globals_, {
        get: (target, prop) => {
            // Test for initialize()
            if (
                !initialized &&
                !target.isWeb // extension instance globals would have set this truly globally prior to the test instance globals being accessed.
            ) {
                throw new Error(`ToolkitGlobals accessed before initialize()`)
            }

            // Test that the property was set before access.
            // Tradeoff: not being able to do something like `globals.myValue ??= ...` without a try/catch
            const propName = String(prop)
            const val = (target as any)[propName]
            if (
                val !== undefined ||
                propName.includes('Symbol') // hack for sinon.stub
            ) {
                return val
            }
            throw new Error(`ToolkitGlobals.${propName} accessed, but this property is not set.`)
        },
    })
}

/**
 * Extension globals object.
 * Unless this is running in web mode, these globals are scoped only to the current extension.
 *
 * TODO: If multiple extensions are running in webmode, they will override and access
 * each other's globals. We should partition globalThis by extension ID.
 */
let globals = proxyGlobals(resolveGlobalsObject())

export function checkDidReload(context: ExtensionContext): boolean {
    return !!context.globalState.get<string>('ACTIVATION_LAUNCH_PATH_KEY')
}

let initialized = false
export function initialize(context: ExtensionContext, isWeb: boolean = false): ToolkitGlobals {
    if (!isWeb) {
        // Not running in web mode, let's use globals scoped to the current extension only.
        globals = proxyGlobals({} as ToolkitGlobals)
    }
    Object.assign(globals, {
        context,
        clock: copyClock(),
        didReload: checkDidReload(context),
        manifestPaths: {} as ToolkitGlobals['manifestPaths'],
        visualizationResourcePaths: {} as ToolkitGlobals['visualizationResourcePaths'],
        isWeb,
    })
    void vscode.commands.executeCommand('setContext', 'aws.isWebExtHost', isWeb)

    initialized = true

    return globals
}

export function isWeb() {
    return globals.isWeb
}

export { globals as default }

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
interface ToolkitGlobals {
    readonly context: ExtensionContext
    /** Decides the prefix for package.json extension parameters, e.g. commands, 'setContext' values, etc. */
    contextPrefix: string
    // TODO: make the rest of these readonly (or delete them)
    outputChannel: OutputChannel
    logOutputChannel: OutputChannel
    loginManager: LoginManager
    awsContextCommands: AwsContextCommands
    awsContext: AwsContext
    regionProvider: RegionProvider
    sdkClientBuilder: AWSClientBuilder
    telemetry: TelemetryService & { logger: TelemetryLogger }
    /** template.yaml registry. _Avoid_ calling this until it is actually needed (for SAM features). */
    templateRegistry: Promise<CloudFormationTemplateRegistry>
    schemaService: SchemaService
    codelensRootRegistry: CodelensRootRegistry
    resourceManager: AwsResourceManager
    uriHandler: UriHandler
    /** An id to differentiate the current machine being run on. Can help distinguish a remote from a local machine.  */
    machineId: string

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
    /** If this extension is running in Web mode (the browser), compared to running on the desktop (node) */
    isWeb: boolean
}
