/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    join
} from 'path'
import {
    CancellationToken,
    DebugConfiguration,
    DebugConfigurationProvider,
    WorkspaceFolder
} from 'vscode'
import {
    mkdirAsync,
    readdirAsync,
    statAsync,
    writeFileAsync
} from '../../shared/filesystem'
import { fileExists, readFileAsString } from '../../shared/filesystemUtilities'
import { detectLocalLambdas, LocalLambda } from './detectLocalLambdas'

interface NodeDebugConfiguration extends DebugConfiguration {
    readonly type: 'node'
    readonly request: 'attach' | 'launch'
    readonly name: string
    readonly preLaunchTask?: string
    readonly address: 'localhost'
    readonly port: number
    readonly localRoot: string
    readonly remoteRoot: '/var/task'
    readonly protocol: 'legacy' | 'inspector'
    readonly skipFiles?: string[]
}

interface LambdaWithPreLaunchTask {
    lambda: LocalLambda
    task: string
}

interface TasksConfig {
    version: '2.0.0'
    tasks?: {
        label?: string
    }[]
}

export class NodeDebugConfigurationProvider implements DebugConfigurationProvider {
    public async resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration,
        token?: CancellationToken
    ): Promise<NodeDebugConfiguration> {
        throw new Error('Not Implemented')
    }

    public async provideDebugConfigurations(
        folder: WorkspaceFolder | undefined,
        token?: CancellationToken
    ): Promise<NodeDebugConfiguration[]> {
        if (!folder) {
            console.error('Cannot provide debug configuration if no workspace is open.')

            return []
        }

        const npmProject = await this.findNpmProject(folder, token)
        // tslint:disable-next-line:no-invalid-template-strings
        const localRoot = !!npmProject ? join('${workspaceFolder}', npmProject) : '${workspaceFolder}'

        const localLambdas: LambdaWithPreLaunchTask[] = await Promise.all(
            (await detectLocalLambdas([ folder ])).map(async localLambda => ({
                lambda: localLambda,
                task: await this.addPreLaunchTask(folder, localLambda.lambda, {}, 5858)
            }))
        )

        return localLambdas.reduce(
            (accumulator: NodeDebugConfiguration[], localLamdba: LambdaWithPreLaunchTask) => {
                accumulator.push(
                    {
                        type: 'node',
                        request: 'launch',
                        name: `Lambda: Debug ${localLamdba.lambda.lambda} locally`,
                        preLaunchTask: localLamdba.task,
                        address: 'localhost',
                        port: 5858,
                        localRoot,
                        remoteRoot: '/var/task',
                        protocol: 'inspector',
                        skipFiles: [
                            '/var/runtime/node_modules/**/*.js',
                            '<node_internals>/**/*.js'
                        ]
                    },
                    {
                        type: 'node',
                        request: 'attach',
                        name: `Lambda: Attach to ${localLamdba.lambda.lambda} locally`,
                        preLaunchTask: undefined,
                        address: 'localhost',
                        port: 5858,
                        localRoot,
                        remoteRoot: '/var/task',
                        protocol: 'inspector',
                        skipFiles: [
                            '/var/runtime/node_modules/**/*.js',
                            '<node_internals>/**/*.js'
                        ]
                    }
                )

                return accumulator
            },
            []
        )
    }

    /**
     * `sam init` puts the local root in a subdirectory. We attempt to detect this subdirectory by looking
     * for child folders that contain a package.json file. If the root workspace folder does not contain
     * package.json, AND exactly one of its direct children contains package.json, use that child as the
     * local root.
     */
    private async findNpmProject(
        folder: WorkspaceFolder,
        token?: CancellationToken
    ): Promise<string | undefined> {
        // The root directory is an npm package, so we don't need to look in subdirectories.
        if (await fileExists(join(folder.uri.fsPath, 'package.json'))) {
            return undefined
        }

        const entries: string[] = await readdirAsync(folder.uri.fsPath)

        const candidates: string[] = (await Promise.all(entries.map(async entry => {
            const entryPath = join(folder.uri.fsPath, entry)
            if (await fileExists(entryPath) && (await statAsync(entryPath)).isDirectory()) {
                return await fileExists(join(entryPath, 'package.json')) ? entry : undefined
            }

            return undefined
        }))).filter(c => !!c).map(c => c as string)

        return candidates.length === 1 ? candidates[0] : undefined
    }

    private getTaskLabel(functionName: string): string {
        return `Lambda: Invoke ${functionName} locally`
    }

    private async addPreLaunchTask(
        folder: WorkspaceFolder,
        functionName: string,
        event: { [ key: string ]: string } = {},
        debugPort: number = 5858
    ): Promise<string> {
        const label = this.getTaskLabel(functionName)
        const configRoot = join(folder.uri.fsPath, '.vscode')
        const tasksPath = join(configRoot, 'tasks.json')

        let tasks: TasksConfig | undefined
        if (await fileExists(tasksPath)) {
            tasks = JSON.parse(await readFileAsString(tasksPath, 'utf8')) as TasksConfig | undefined
        }

        if (!tasks) {
            tasks = {
                version: '2.0.0'
            }
        }

        if (!tasks.tasks) {
            tasks.tasks = []
        }

        if (!tasks.tasks.some(t => t.label === label)) {
            tasks.tasks.push(this.createPreLaunchTask(functionName, event, debugPort))
        }

        if (!await fileExists(configRoot) || !(await statAsync(configRoot)).isDirectory()) {
            await mkdirAsync(configRoot)
        }
        // TODO: Read user's tab-width setting and use that instead of hard-coding '4'.
        await writeFileAsync(tasksPath, JSON.stringify(tasks, undefined, 4))

        return label
    }

    private createPreLaunchTask(
        functionName: string,
        event: { [ key: string ]: string } = {},
        debugPort: number = 5858
    ) {
        return {
            type: 'shell',
            label: this.getTaskLabel(functionName),
            command: 'echo',
            args: [
                `${this.escapeForBash(JSON.stringify(event))}`,
                '|',
                'sam',
                'local',
                'invoke',
                `${this.escapeForBash(functionName)}`,
                '-d',
                `${debugPort}`
            ],
            windows: {
                args: [
                    `${this.escapeForPowerShell(JSON.stringify(event))}`,
                    '|',
                    'sam',
                    'local',
                    'invoke',
                    `${this.escapeForPowerShell(functionName)}`,
                    '-d',
                    `${debugPort}`
                ],
            },
            isBackground: true,
            presentation: {
                echo: true,
                reveal: 'always',
                focus: false,
                panel: 'dedicated',
                showReuseMessage: true
            },
            problemMatcher: {
                owner: 'lambda-node',
                // tslint:disable-next-line:no-invalid-template-strings
                fileLocation: [ 'relative', '${workspaceFolder}' ],
                pattern: [
                    {
                        // TODO: For now, use regex that never matches anything.
                        // Update as we determine what issues we can recognize.
                        regexp: '^(x)(\b)(x)$',
                        file: 1,
                        location: 2,
                        message: 3
                    }
                ],
                background: {
                    activeOnStart: true,
                    beginsPattern: String.raw`^Fetching lambci\/lambda:nodejs\d+\.\d+ Docker container image......$`,
                    // tslint:disable-next-line:max-line-length
                    endsPattern: String.raw`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Mounting ((\w:)?([\\\/][^\\\/]+)*) as ((\w:)?([\\\/][^\\\/]+)*:ro) inside runtime container$`
                }
            }
        }
    }

    private escapeForBash(input: string): string {
        // In bash, there are no escape sequences within a single-quoted string, so we have to concatenate instead.
        return `'${input.replace("'", "'\"'\"'")}'`
    }

    private escapeForPowerShell(input: string): string {
        // In PowerShell, the only escape sequence within a single-quoted string is '' to escape '.
        return `'${input.replace("'", "''")}'`
    }
}
