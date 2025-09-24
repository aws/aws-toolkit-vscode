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
 * Parses an os-release file according to the freedesktop.org standard.
 *
 * @param content The content of the os-release file
 * @returns A record of key-value pairs from the os-release file
 *
 * @see https://www.freedesktop.org/software/systemd/man/latest/os-release.html
 */
function parseOsRelease(content: string): Record<string, string> {
    const result: Record<string, string> = {}

    for (let line of content.split('\n')) {
        line = line.trim()
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) {
            continue
        }

        const eqIndex = line.indexOf('=')
        if (eqIndex > 0) {
            const key = line.slice(0, eqIndex)
            const value = line.slice(eqIndex + 1).replace(/^["']|["']$/g, '')
            result[key] = value
        }
    }

    return result
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
 * This function detects if we're actually running on AL2, not just if the host is AL2.
 * In containerized environments, we check the container's OS, not the host's.
 *
 * Detection Process (in order):
 * 1. Returns false for web environments (browser-based)
 * 2. Returns false for SageMaker environments (even if host is AL2)
 * 3. Checks `/etc/os-release` with fallback to `/usr/lib/os-release`
 *    - Standard Linux OS identification files
 *    - Explicitly checks for and rejects Amazon Linux 2023
 *    - Looks for `ID="amzn"` and `VERSION_ID="2"` for AL2
 * 4. Falls back to kernel version check as last resort
 *    - Checks for `.amzn2.` or `.amzn2int.` in kernel release
 *    - Only used if file-based detection fails or confirms AL2
 *
 * This approach ensures correct detection in:
 * - Containerized environments (detects container OS, not host)
 * - Web/browser environments (returns false)
 * - Amazon Linux 2023 systems (properly distinguished from AL2)
 * - SageMaker environments (returns false)
 *
 * References:
 * - https://docs.aws.amazon.com/linux/al2/ug/ident-amazon-linux-specific.html
 * - https://docs.aws.amazon.com/linux/al2/ug/ident-os-release.html
 *
 * Example kernel versions:
 * - `5.10.220-188.869.amzn2int.x86_64` (internal AL2)
 * - `5.10.236-227.928.amzn2.x86_64` (Cloud Dev Machine)
 */
export function isAmazonLinux2() {
    // Skip AL2 detection for web environments
    // In web mode, we're running in a browser, not on AL2
    if (isWeb()) {
        return false
    }

    // First check if we're in a SageMaker environment, which should not be treated as AL2
    // even if the underlying host is AL2
    if (hasSageMakerEnvVars()) {
        return false
    }

    // Only proceed with file checks on Linux platforms
    if (process.platform !== 'linux') {
        return false
    }

    // For containerized environments, check the actual container OS
    // not the host kernel version
    try {
        const fs = require('fs')
        // Check /etc/os-release with fallback to /usr/lib/os-release as per https://docs.aws.amazon.com/linux/al2/ug/ident-os-release.html
        const osReleasePaths = ['/etc/os-release', '/usr/lib/os-release']
        for (const osReleasePath of osReleasePaths) {
            if (fs.existsSync(osReleasePath)) {
                try {
                    const osReleaseContent = fs.readFileSync(osReleasePath, 'utf8')
                    const osRelease = parseOsRelease(osReleaseContent)

                    // Check if this is Amazon Linux 2023 (not AL2)
                    if (osRelease.VERSION_ID === '2023' || osRelease.PLATFORM_ID === 'platform:al2023') {
                        // This is Amazon Linux 2023, not AL2
                        return false
                    }

                    // Check if this is actually Amazon Linux 2
                    // Must be specifically version 2, not 2023 or other versions
                    const isAL2 = osRelease.ID === 'amzn' && osRelease.VERSION_ID === '2'

                    // If we found os-release file, trust its content over kernel version
                    if (!isAL2) {
                        // Explicitly not AL2 based on os-release
                        return false
                    }
                    // If it is AL2 according to os-release, continue to kernel check for confirmation
                    break // Found and processed os-release, no need to check fallback
                } catch (e) {
                    // Continue to next path or fallback check
                    getLogger().error(`Parsing os-release file failed with error: ${e}`)
                }
            }
        }
    } catch (e) {
        // If we can't read the files, fall back to the os.release() check
        // This might happen in some restricted environments
        getLogger().error(`Checking the current environment failed with error: ${e}`)
    }

    // Check kernel version as a fallback or confirmation
    // This should only be trusted if we couldn't determine from files above
    // or if files confirmed it's AL2
    const kernelRelease = os.release()
    const hasAL2Kernel = kernelRelease.includes('.amzn2int.') || kernelRelease.includes('.amzn2.')

    return hasAL2Kernel
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
        // Check if we're in a Node.js environment (desktop/remote) vs web worker
        // Updated to be compatible with Node.js v22 which includes navigator global
        typeof process === 'object' && process.versions?.node
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
