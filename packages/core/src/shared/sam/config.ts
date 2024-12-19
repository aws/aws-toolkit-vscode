/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import fs from '../fs/fs'
import { JsonMap, parse, stringify } from '@iarna/toml'
import { cast, Optional } from '../utilities/typeConstructors'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'

export interface Config {
    readonly environments: Record<string, Omit<Environment, 'name'>>
}

export interface Environment {
    readonly name: string
    readonly commands: Record<string, Omit<Command, 'name'> | undefined>
}

interface Command {
    readonly name: string
    readonly parameters?: Record<string, unknown>
}

enum DeployType {
    Deploy,
    Sync,
    Build,
}

// This only handles a subset of possible user configs
// `@iarna/toml@2.25` supports 0.5.0 of the spec while SAM CLI 1.67.0 supports 1.0.0
// In practive this is likely good enough for the vast majority of users
export async function parseConfig(contents: string): Promise<Config> {
    const data = await parse.async(contents)
    const objs = Object.entries(data).filter(([_, v]) => typeof v === 'object') as [string, Record<string, unknown>][]
    const environments = {} as Config['environments']
    for (const [k, v] of objs) {
        environments[k] = parseEnvironment(v)
    }

    return { environments }
}

function parseEnvironment(section: Record<string, unknown>): Omit<Environment, 'name'> {
    const objs = Object.entries(section).filter(([_, v]) => typeof v === 'object') as [
        string,
        Record<string, unknown>,
    ][]
    const commands = {} as Environment['commands']
    for (const [k, v] of objs) {
        commands[k] = parseCommand(v)
    }

    return { commands }
}

function parseCommand(section: Record<string, unknown>): Omit<Command, 'name'> {
    return { parameters: cast(section['parameters'], Optional(Object)) }
}

export enum SamConfigErrorCode {
    samNoConfigFound = 'samNoConfigFound',
    samConfigParseError = 'samConfigParseError',
    samNoProjectRootFound = 'samNoProjectRootFound',
}

export class SamConfig {
    public constructor(
        public readonly location: vscode.Uri,
        private readonly config: Config = { environments: {} }
    ) {}

    public getCommand(command: string, targetEnv = 'default') {
        const env = this.config.environments[targetEnv]
        return env?.commands[command]
    }

    public getCommandParam(command: string, key: string, targetEnv = 'default'): unknown {
        const primarySection = this.getCommand(command, targetEnv)
        const globalSection = this.getCommand('global', targetEnv)
        return primarySection?.parameters?.[key] ?? globalSection?.parameters?.[key]
    }

    /**
     * @description Finds samconfig.toml file under the provided project folder
     * @param projectRoot The root folder of the application project
     * @returns The SamConfig object
     */
    public static async fromProjectRoot(projectRoot: vscode.Uri) {
        if (!projectRoot) {
            throw new ToolkitError('No project folder found', { code: SamConfigErrorCode.samNoProjectRootFound })
        }
        const uri = await getConfigFileUri(projectRoot)
        return this.fromConfigFileUri(uri)
    }

    /**
     * @description Parse Samconfig content in samconfig.toml
     * @param uri The vscode uri of samconfig.toml
     * @returns The SamConfig object
     */
    public static async fromConfigFileUri(uri: vscode.Uri) {
        try {
            const contents = await fs.readFileText(uri)
            const config = await parseConfig(contents)
            return new this(uri, config)
        } catch (error) {
            throw new ToolkitError(`Error parsing samconfig.toml: ${error}`, {
                code: SamConfigErrorCode.samConfigParseError,
            })
        }
    }

    public listEnvironments(): Environment[] {
        const envs = this.config.environments

        return Object.entries(envs).map(([name, data]) => ({ name, ...data }))
    }
}

function generateConfigFileName(projectRoot: vscode.Uri) {
    return vscode.Uri.joinPath(projectRoot, 'samconfig.toml')
}

/**
 * @description Finds the samconfig.toml file under the provided project folder
 * @param projectRoot The root folder of the application project
 * @returns The URI of the samconfig.toml file
 */
export async function getConfigFileUri(projectRoot: vscode.Uri) {
    const path = generateConfigFileName(projectRoot)
    if (!(await fs.exists(path.fsPath))) {
        getLogger().warn('No samconfig.toml found')
        throw new ToolkitError(`No samconfig.toml file found in ${projectRoot.fsPath}`, {
            code: SamConfigErrorCode.samNoConfigFound,
        })
    }
    return path
}

/**
 * @description Overwrite stack name and region information to samconfig.toml file.
 *              If samconfig.toml file doesn't exist, create a new one.
 * @param projectRoot The root folder of the application project
 * @param stackName The name of the stack
 * @param region The region of the stack
 */
export async function writeSamconfigGlobal(projectRoot: vscode.Uri, stackName: string, region: string) {
    const path = vscode.Uri.joinPath(projectRoot, 'samconfig.toml')
    if (!(await fs.exists(path))) {
        getLogger().warn('No samconfig.toml found, creating...')
        const data = { default: { global: { parameters: { stack_name: stackName, region: region } } } }
        return createNewConfigFile(projectRoot, data)
    }
    const contents = await fs.readFileText(path)
    const data = await parse.async(contents)
    if (data.default) {
        const defaultEnv = data.default as { global?: { parameters?: Record<string, unknown> } }
        if (defaultEnv.global) {
            if (defaultEnv.global.parameters) {
                defaultEnv.global.parameters.stack_name = stackName
                defaultEnv.global.parameters.region = region
            }
        } else {
            defaultEnv.global = { parameters: { stack_name: stackName, region: region } }
        }
    }
    const obj = stringify(data)
    await fs.writeFile(path, obj)
}

/**
 * @description Create a new samconfig.toml file under the provided project folder. 
 *              This will overwrite the existing file.

 * @param projectRoot The root folder of the application project
 * @param data The data to be written to the new samconfig.toml file
 */
export async function createNewConfigFile(projectRoot: vscode.Uri, data: JsonMap) {
    const path = generateConfigFileName(projectRoot)
    await fs.writeFile(path, 'version = 0.1\n\n')
    await fs.appendFile(path, stringify(data))
}

async function validateAppBuilderSamConfig(
    projectRoot: vscode.Uri | undefined,
    configType: DeployType
): Promise<boolean> {
    if (!projectRoot) {
        return false
    }

    let content
    try {
        content = await SamConfig.fromProjectRoot(projectRoot)
    } catch (error) {
        return false
    }

    const globalRegion = content.getCommandParam('global', 'region')
    const globalStackName = content.getCommandParam('global', 'stack_name')
    const buildCommandConfig = content.getCommand('build')
    const deployCommandConfig = content.getCommand('deploy')
    const syncCommandConfig = content.getCommand('sync')

    const hasRequiredGlobalParams: boolean = !!globalRegion && !!globalStackName
    const hasRequiredDeployParameters: boolean = !!hasRequiredGlobalParams && !!deployCommandConfig
    const hasRequiredSyncParameters: boolean = !!hasRequiredGlobalParams && !!syncCommandConfig

    switch (configType) {
        case DeployType.Deploy:
            return hasRequiredGlobalParams && hasRequiredDeployParameters
        case DeployType.Sync:
            return hasRequiredGlobalParams && hasRequiredSyncParameters
        case DeployType.Build:
            return !!buildCommandConfig
        default:
            getLogger().error(`Unsupported config type: ${configType}`)
            return false
    }
}

export async function validateSamDeployConfig(uri: vscode.Uri | undefined) {
    return await validateAppBuilderSamConfig(uri, DeployType.Deploy)
}

export async function validateSamSyncConfig(uri: vscode.Uri | undefined) {
    return await validateAppBuilderSamConfig(uri, DeployType.Sync)
}

export async function validateSamBuildConfig(uri: vscode.Uri | undefined) {
    return await validateAppBuilderSamConfig(uri, DeployType.Build)
}
