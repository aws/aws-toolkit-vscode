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
 * Checks if the current environment has SageMaker-specific environment variables
 * @returns true if SageMaker environment variables are detected
 */
export function hasSageMakerEnvVars(): boolean {
    // Check both old and new environment variable names
    // SageMaker is renaming their environment variables in their Docker images
    return (
        // Original environment variables
        process.env.SAGEMAKER_APP_TYPE !== undefined ||
        process.env.SAGEMAKER_INTERNAL_IMAGE_URI !== undefined ||
        process.env.STUDIO_LOGGING_DIR?.includes('/var/log/studio') === true ||
        // New environment variables (update these with the actual new names)
        process.env.SM_APP_TYPE !== undefined ||
        process.env.SM_INTERNAL_IMAGE_URI !== undefined ||
        process.env.SERVICE_NAME === 'SageMakerUnifiedStudio'
    )
}

/**
 * Checks if the current environment is running on Amazon Linux 2.
 *
 * This function attempts to detect if we're running in a container on an AL2 host
 * by checking both the OS release and container-specific indicators.
 *
 * Example: `5.10.220-188.869.amzn2int.x86_64` or `5.10.236-227.928.amzn2.x86_64` (Cloud Dev Machine)
 */
export function isAmazonLinux2() {
    // First check if we're in a SageMaker environment, which should not be treated as AL2
    // even if the underlying host is AL2
    if (hasSageMakerEnvVars()) {
        return false
    }

    // Check if we're in a container environment that's not AL2
    if (process.env.container === 'docker' || process.env.DOCKER_HOST || process.env.DOCKER_BUILDKIT) {
        // Additional check for container OS - if we can determine it's not AL2
        try {
            const fs = require('fs')
            if (fs.existsSync('/etc/os-release')) {
                const osRelease = fs.readFileSync('/etc/os-release', 'utf8')
                if (!osRelease.includes('Amazon Linux 2') && !osRelease.includes('amzn2')) {
                    return false
                }
            }
        } catch (e) {
            // If we can't read the file, fall back to the os.release() check
        }
    }

    // Standard check for AL2 in the OS release string
    return (os.release().includes('.amzn2int.') || os.release().includes('.amzn2.')) && process.platform === 'linux'
}

/**
 * Returns true if we are in an internal Amazon Cloud Desktop
 */
export async function isCloudDesktop() {
    if (!isAmazonLinux2()) {
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
    // Eclipse Che-based envs (backing compute rotates, not classified as a web instance)
    // TODO: use `vscode.env.machineId` instead?
    if (process.env.CHE_WORKSPACE_ID) {
        return process.env.CHE_WORKSPACE_ID
    }
    // RedHat Dev Workspaces (run some VSC web variant)
    if (process.env.DEVWORKSPACE_ID) {
        return process.env.DEVWORKSPACE_ID
    }
    const proc = new ChildProcess('hostname', [], { collect: true, logging: 'no' })
    // TODO: check exit code.
    return (await proc.run()).stdout.trim() ?? 'unknown-host'
}
