/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'
import * as packageJson from '../../../package.json'
import { getLogger } from '../logger'
import { onceChanged } from '../utilities/functionUtils'

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
 * prerelease/test/nightly build)
 */
export function isReleaseVersion(prereleaseOk: boolean = false): boolean {
    return (prereleaseOk || !semver.prerelease(extensionVersion)) && extensionVersion !== testVersion
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

/**
 * Returns true if name mangling has occured to the extension source code.
 */
export function isNameMangled(): boolean {
    return isNameMangled.name !== 'isNameMangled'
}

export { extensionVersion }

/**
 * Returns true if the extension is being ran on the minimum version of VS Code as defined
 * by the `engines` field in `package.json`
 */
export function isMinimumVersion(): boolean {
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

export function getCodeCatalystProjectName(): string | undefined {
    return process.env['__DEV_ENVIRONMENT_PROJECT_NAME']
}

export function getCodeCatalystSpaceName(): string | undefined {
    // TODO: remove legacy __DEV_ENVIRONMENT_ORGANIZATION_NAME
    return process.env['__DEV_ENVIRONMENT_SPACE_NAME'] || process.env['__DEV_ENVIRONMENT_ORGANIZATION_NAME']
}

type ConfigToEnvMap = { [key: string]: string }
type ServiceConfig = Partial<{ [K in keyof ConfigToEnvMap]: any }>
const logConfigsOnce: { [key: string]: ReturnType<typeof onceChanged> } = {}

/**
 * Accepts a service name and a {config key -> expected env var name} map.
 * For each config key, check if the associated env var exists and return
 * a config map with the found values. Changes are logged once for each
 * service/found env var combos.
 */
export function getServiceEnvVarConfig(service: string, configToEnvMap: ConfigToEnvMap): ServiceConfig {
    const config: ServiceConfig = {}
    const overriden: string[] = []

    // Find env vars for each field in the config
    for (const [field, envKey] of Object.entries(configToEnvMap)) {
        if (envKey in process.env) {
            config[field] = process.env[envKey]
            overriden.push(envKey)
        }
    }

    // Log env var overrides, keeping track of which service we are logging for.
    // This allows us to log only once when env vars for a service change.
    if (overriden.length > 0) {
        if (!(service in logConfigsOnce)) {
            logConfigsOnce[service] = onceChanged(vars => {
                getLogger().info(`using env vars for ${service} config: ${vars}`)
            })
        }
        logConfigsOnce[service](overriden)
    }

    return config
}
