/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'
import * as packageJson from '../../../package.json'
import * as os from 'os'
import { getLogger } from '../logger/logger'
import { onceChanged } from '../utilities/functionUtils'
import { ChildProcess } from '../utilities/processUtils'
import globals, { isWeb } from '../extensionGlobals'
import * as devConfig from '../../dev/config'

/**
 * Returns true if the current build is running on CI (build server).
 */
export function isCI(): boolean {
    return undefined !== process.env['GITHUB_ACTION'] || undefined !== process.env['CODEBUILD_BUILD_ID']
}

/** Variable added via webpack */
declare let EXTENSION_VERSION: string // eslint-disable-line @typescript-eslint/naming-convention
const testVersion = 'testPluginVersion'

/** The current extension version. If not built via Webpack, this defaults to {@link testVersion}. */
let extensionVersion = testVersion
try {
    extensionVersion = EXTENSION_VERSION
} catch (e) {} // Just a reference error

/**
 * Returns true if the current build is a production build (as opposed to a
 * prerelease/test/nightly build).
 *
 * Note: `isBeta()` is treated separately.
 */
export function isReleaseVersion(prereleaseOk: boolean = false): boolean {
    return (prereleaseOk || !semver.prerelease(extensionVersion)) && extensionVersion !== testVersion
}

/**
 * Returns true if the current build is a "beta" build.
 */
export function isBeta(): boolean {
    const testing = extensionVersion === testVersion
    for (const url of Object.values(devConfig.betaUrl)) {
        if (url && url.length > 0) {
            if (!testing && semver.lt(extensionVersion, '99.0.0-dev')) {
                throw Error('beta build must set version=99.0.0 in package.json')
            }

            return true
        }
    }
    return false
}

/**
 * Returns true when source mapping is available
 */
export function isSourceMappingAvailable(): boolean {
    return extensionVersion === testVersion
}

/**
 * Returns true if the extension is being ran from automation.
 */
export function isAutomation(): boolean {
    return isCI() || !!process.env['AWS_TOOLKIT_AUTOMATION']
}

/** Returns true if this extension is in a `Run & Debug` instance of VS Code. */
export function isDebugInstance(): boolean {
    /**
     * This is a loose heuristic since the env var was not intentionally made to indicate a debug instance.
     * If we ever get rid of this env var, just make a new env var in the same place.
     */
    return !!process.env['WEBPACK_DEVELOPER_SERVER']
}

export { extensionVersion }

/**
 * True if the current running vscode is the minimum defined by `engines.vscode` in `package.json`.
 *
 * @param throwWhen Throw if minimum vscode is equal or later than this version.
 */
export function isMinVscode(options?: { throwWhen: string }): boolean {
    const minVscode = getMinVscodeVersion()
    if (options?.throwWhen && semver.gte(minVscode, options.throwWhen)) {
        throw Error(`Min vscode ${minVscode} >= ${options.throwWhen}. Delete or update the code that called this.`)
    }
    return vscode.version.startsWith(getMinVscodeVersion())
}

/**
 * Returns the minimum vscode "engine" version declared in `package.json`.
 */
export function getMinVscodeVersion(): string {
    return packageJson.engines.vscode.replace(/[^~]/, '')
}

/**
 * Returns the minimum nodejs version declared in `package.json`.
 */
export function getMinNodejsVersion(): string {
    return packageJson.devDependencies['@types/node'].replace(/[^~]/, '')
}

export function getCodeCatalystDevEnvId(): string | undefined {
    return process.env['__DEV_ENVIRONMENT_ID']
}

/**
 * Returns true if we are in a dev env
 */
export function isInDevEnv(): boolean {
    return !!getCodeCatalystDevEnvId()
}

export function isRemoteWorkspace(): boolean {
    return vscode.env.remoteName === 'ssh-remote'
}

/**
 * There is Amazon Linux 2, but additionally an Amazon Linux 2 Internal.
 * The internal version is for Amazon employees only. And this version can
 * be used by either EC2 OR CloudDesktop. It is not exclusive to either.
 *
 * Use {@link isCloudDesktop()} to know if we are specifically using it.
 *
 * Example: `5.10.220-188.869.amzn2int.x86_64`
 */
export function isAmazonInternalOs() {
    return os.release().includes('amzn2int') && process.platform === 'linux'
}

/**
 * Returns true if we are in an internal Amazon Cloud Desktop
 */
export async function isCloudDesktop() {
    if (!isAmazonInternalOs()) {
        return false
    }

    // This heuristic is explained in IDE-14524
    return (await new ChildProcess('/apollo/bin/getmyfabric').run().then((r) => r.exitCode)) === 0
}

export function isMac(): boolean {
    return process.platform === 'darwin'
}
/** Returns true if OS is Windows. */
export function isWin(): boolean {
    // if (isWeb()) {
    //     return false
    // }

    return process.platform === 'win32'
}

const UIKind = {
    [vscode.UIKind.Desktop]: 'desktop',
    [vscode.UIKind.Web]: 'web',
} as const
export type ExtensionHostUI = (typeof UIKind)[keyof typeof UIKind]
export type ExtensionHostLocation = 'local' | 'remote' | 'webworker'

/**
 * Detects where the ui and the extension host are running
 */
export function getExtRuntimeContext(): {
    ui: ExtensionHostUI
    extensionHost: ExtensionHostLocation
} {
    const extensionHost =
        // taken from https://github.com/microsoft/vscode/blob/7c9e4bb23992c63f20cd86bbe7a52a3aa4bed89d/extensions/github-authentication/src/githubServer.ts#L121 to help determine which auth flows
        // should be used
        typeof navigator === 'undefined'
            ? globals.context.extension.extensionKind === vscode.ExtensionKind.UI
                ? 'local'
                : 'remote'
            : 'webworker'

    return {
        ui: UIKind[vscode.env.uiKind],
        extensionHost,
    }
}

export function getCodeCatalystProjectName(): string | undefined {
    return process.env['__DEV_ENVIRONMENT_PROJECT_NAME']
}

export function getCodeCatalystSpaceName(): string | undefined {
    // TODO: remove legacy __DEV_ENVIRONMENT_ORGANIZATION_NAME
    return process.env['__DEV_ENVIRONMENT_SPACE_NAME'] || process.env['__DEV_ENVIRONMENT_ORGANIZATION_NAME']
}

type ServiceConfig<T extends string[]> = Partial<{
    [K in T[number]]: string
}>
const logConfigsOnce: { [key: string]: ReturnType<typeof onceChanged> } = {}

/**
 * Generate a map of environment variable names to environment variables.
 *
 * It does this by converting camel case entries in envVarNames to uppercase joined by underscores
 * If there is no camel case in an entry in envVarNames then it just converts the envVar to uppercase
 *
 * E.g. if service is codecatalyst:
 *  gitHostname -> __CODECATALYST_GIT_HOSTNAME
 *  region -> __CODECATALYST_REGION
 */
export function getEnvVars<T extends string[]>(service: string, envVarNames: T): ServiceConfig<T> {
    const envVars: ServiceConfig<T> = {}
    for (const name of envVarNames) {
        // convert camel case to uppercase joined by underscores
        // e.g. gitHostname -> GIT_HOSTNAME
        const envVarName = name
            .split(/(?=[A-Z])/)
            .map((s) => s.toUpperCase())
            .join('_')
        envVars[name as T[number]] = `__${service.toUpperCase()}_${envVarName}`
    }
    return envVars
}

/**
 * Accepts a service name and an array of configs.
 * For each config key, check if the associated env var exists and return
 * a config map with the found values. Changes are logged once for each
 * service/found env var combos.
 */
export function getServiceEnvVarConfig<T extends string[]>(service: string, configs: T): ServiceConfig<T> {
    const config: ServiceConfig<T> = {}
    const overriden: string[] = []

    // Find env vars for each field in the config
    const envVars = getEnvVars<T>(service, configs)
    for (const [field, envKey] of Object.entries(envVars) as [string, string][]) {
        if (envKey in process.env) {
            config[field as T[number]] = process.env[envKey]
            overriden.push(envKey)
        }
    }

    // Log env var overrides, keeping track of which service we are logging for.
    // This allows us to log only once when env vars for a service change.
    if (overriden.length > 0) {
        if (!(service in logConfigsOnce)) {
            logConfigsOnce[service] = onceChanged((vars) => {
                getLogger().info(`using env vars for ${service} config: ${vars}`)
            })
        }
        logConfigsOnce[service](overriden)
    }

    return config
}

export async function getMachineId(): Promise<string> {
    if (isWeb()) {
        // TODO: use `vscode.env.machineId` instead?
        return 'browser'
    }
    const proc = new ChildProcess('hostname', [], { collect: true, logging: 'no' })
    // TODO: check exit code.
    return (await proc.run()).stdout.trim() ?? 'unknown-host'
}
