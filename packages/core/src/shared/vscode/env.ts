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
            .map(s => s.toUpperCase())
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
            logConfigsOnce[service] = onceChanged(vars => {
                getLogger().info(`using env vars for ${service} config: ${vars}`)
            })
        }
        logConfigsOnce[service](overriden)
    }

    return config
}
