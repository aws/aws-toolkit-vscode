/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { parse } from '@iarna/toml'
import { SystemUtilities } from '../systemUtilities'
import { cast, Optional } from '../utilities/typeConstructors'

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
        Record<string, unknown>
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
    public constructor(public readonly location: vscode.Uri, private readonly config: Config = { environments: {} }) {}

    public getParam(command: string, key: string, targetEnv = 'default'): unknown {
        const env = this.config.environments[targetEnv]
        const primarySection = env?.commands[command]
        const globalSection = env?.commands['global']

        return primarySection?.parameters?.[key] ?? globalSection?.parameters?.[key]
    }

    public listEnvironments(): Environment[] {
        const envs = this.config.environments

        return Object.entries(envs).map(([name, data]) => ({ name, ...data }))
    }

    public static async fromUri(uri: vscode.Uri) {
        const contents = await SystemUtilities.readFile(uri)
        const config = await parseConfig(contents)

        return new this(uri, config)
    }
}
