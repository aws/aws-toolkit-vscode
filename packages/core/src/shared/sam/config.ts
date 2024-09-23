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
}

// This only handles a subset of possible user configs
// `@iarna/toml@2.25` supports 0.5.0 of the spec while SAM CLI 1.67.0 supports 1.0.0
// In practive this is likely good enough for the vast majority of users
async function parseConfig(contents: string): Promise<Config> {
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

export class SamConfig {
    public constructor(
        public readonly location: vscode.Uri,
        private readonly config: Config = { environments: {} }
    ) {}

    public getParam(command: string, key: string, targetEnv = 'default'): unknown {
        const env = this.config.environments[targetEnv]
        const primarySection = env?.commands[command]
        const globalSection = env?.commands['global']

        return primarySection?.parameters?.[key] ?? globalSection?.parameters?.[key]
    }

    private static generateConfigFileName(projectRoot: vscode.Uri) {
        return vscode.Uri.joinPath(projectRoot, 'samconfig.toml')
    }

    private static async getConfigFileUri(projectRoot: vscode.Uri) {
        const path = SamConfig.generateConfigFileName(projectRoot)
        if (!(await fs.exists(path.fsPath))) {
            getLogger().error('No samconfig.toml found')
            throw new ToolkitError('No project root found')
        }
        return path
    }

    public static async getConfigContent(projectRoot: vscode.Uri) {
        if (!projectRoot) {
            throw new ToolkitError('No project root found')
        }
        const uri = await SamConfig.getConfigFileUri(projectRoot)
        return SamConfig.fromUri(uri)
    }

    public listEnvironments(): Environment[] {
        const envs = this.config.environments

        return Object.entries(envs).map(([name, data]) => ({ name, ...data }))
    }

    public static async writeGlobal(projectRoot: vscode.Uri, stackName: string, region: string) {
        const path = vscode.Uri.joinPath(projectRoot, 'samconfig.toml')
        if (!(await fs.exists(path))) {
            getLogger().warn('No samconfig.toml found, creating...')
            const data = { default: { global: { parameters: { stack_name: stackName, region: region } } } }
            return SamConfig.createNewConfigFile(projectRoot, data)
        }
        const contents = await fs.readFileAsString(path)
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

    public static async fromUri(uri: vscode.Uri) {
        const contents = await fs.readFileAsString(uri)
        const config = await parseConfig(contents)
        return new this(uri, config)
    }

    public static async validateAppBuilderSamConfig(
        projectRoot: vscode.Uri | undefined,
        configType: DeployType
    ): Promise<boolean> {
        if (!projectRoot) {
            return false
        }

        let content
        try {
            content = await SamConfig.getConfigContent(projectRoot)
        } catch (error) {
            return false
        }

        const globalRegion = content.getParam('global', 'region')
        const globalStackName = content.getParam('global', 'stack_name')
        const deployTemplateFile = content.getParam('deploy', 'template_file')
        const syncTemplateFile = content.getParam('sync', 'template_file')

        const hasRequiredGlobalParams: boolean = !!globalRegion && !!globalStackName
        const hasRequiredDeployParameters: boolean = !!hasRequiredGlobalParams && !!deployTemplateFile
        const hasRequiredSyncParameters: boolean = !!hasRequiredGlobalParams && !!syncTemplateFile

        switch (configType) {
            case DeployType.Deploy:
                return hasRequiredGlobalParams && hasRequiredDeployParameters
            case DeployType.Sync:
                return hasRequiredGlobalParams && hasRequiredSyncParameters
            default:
                getLogger().error(`Unsupported config type: ${configType}`)
                return false
        }
    }

    public static async validateSamDeployConfig(uri: vscode.Uri | undefined) {
        return await this.validateAppBuilderSamConfig(uri, DeployType.Deploy)
    }

    public static async validateSamSyncConfig(uri: vscode.Uri | undefined) {
        return await this.validateAppBuilderSamConfig(uri, DeployType.Sync)
    }

    public static async createNewConfigFile(projectRoot: vscode.Uri, data: JsonMap) {
        const path = SamConfig.generateConfigFileName(projectRoot)
        await fs.writeFile(path, 'version = 0.1\n\n')
        await fs.appendFile(path, stringify(data))
    }
}
