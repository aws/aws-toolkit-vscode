/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import * as filesystem from '../../shared/filesystem'
import { fileExists, readFileAsString } from '../../shared/filesystemUtilities'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'
import { detectLocalLambdas, LocalLambda } from './detectLocalLambdas'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as AsyncLock from 'async-lock'
const lock = new AsyncLock()

export interface NodeDebugConfiguration extends vscode.DebugConfiguration {
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

export class NodeDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<NodeDebugConfiguration> {
        throw new Error('Not Implemented')
    }

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken,
        event: any = {}
    ): Promise<NodeDebugConfiguration[]> {
        if (!folder) {
            console.error('Cannot provide debug configuration if no workspace is open.')

            return []
        }

        const npmProject = await this.findNpmProject(folder, token)
        // tslint:disable-next-line:no-invalid-template-strings
        const localRoot = !!npmProject ? path.join('${workspaceFolder}', npmProject) : '${workspaceFolder}'

        const localLambdas: LambdaWithPreLaunchTask[] = await Promise.all(
            (await detectLocalLambdas([ folder ])).map(async localLambda => ({
                lambda: localLambda,
                task: await this.addPreLaunchTask(folder, localLambda.lambda, event, 5858)
            }))
        )

        return localLambdas.reduce(
            (accumulator: NodeDebugConfiguration[], localLamdba: LambdaWithPreLaunchTask) => {
                accumulator.push(
                    {
                        type: 'node',
                        request: 'launch',
                        name: localize(
                            'AWS.lambda.debug.node.launchConfig.name',
                            'Lambda: Debug {0} locally',
                            localLamdba.lambda.lambda
                        ),
                        preLaunchTask: localLamdba.task,
                        address: 'localhost',
                        port: 5858,
                        localRoot,
                        remoteRoot: '/var/task',
                        protocol: localLamdba.lambda.protocol,
                        skipFiles: [
                            '/var/runtime/node_modules/**/*.js',
                            '<node_internals>/**/*.js'
                        ]
                    },
                    {
                        type: 'node',
                        request: 'attach',
                        name: localize(
                            'AWS.lambda.debug.node.attachConfig.name',
                            'Lambda: Attach to {0} locally"',
                            localLamdba.lambda.lambda
                        ),
                        preLaunchTask: undefined,
                        address: 'localhost',
                        port: 5858,
                        localRoot,
                        remoteRoot: '/var/task',
                        protocol: localLamdba.lambda.protocol,
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
     *
     * @returns If `folder` does not contain `package.json`, and exactly one of `folder`'s children returns
     *          package.json, returns path to `subfolder/package.json`. Otherwise, returns undefined.
     */
    private async findNpmProject(
        folder: vscode.WorkspaceFolder,
        token?: vscode.CancellationToken
    ): Promise<string | undefined> {
        // The root directory is an npm package, so we don't need to look in subdirectories.
        if (await fileExists(path.join(folder.uri.fsPath, 'package.json'))) {
            return undefined
        }

        const entries: string[] = await filesystem.readdirAsync(folder.uri.fsPath)

        const candidates: string[] = (await Promise.all(entries.map(async entry => {
            const entryPath = path.join(folder.uri.fsPath, entry)
            if (await fileExists(entryPath) && (await filesystem.statAsync(entryPath)).isDirectory()) {
                return await fileExists(path.join(entryPath, 'package.json')) ? entry : undefined
            }

            return undefined
        }))).filter(c => !!c).map(c => c as string)

        return candidates.length === 1 ? candidates[0] : undefined
    }

    private getTaskLabel(functionName: string): string {
        return localize(
            'AWS.lambda.debug.node.invokeTask.label"',
            'Lambda: Invoke {0} locally',
            functionName
        )
    }

    private async addPreLaunchTask(
        folder: vscode.WorkspaceFolder,
        functionName: string,
        event: any,
        debugPort: number = 5858
    ): Promise<string> {
        const label = this.getTaskLabel(functionName)
        const configRoot = path.join(folder.uri.fsPath, '.vscode')
        const tasksPath = path.join(configRoot, 'tasks.json')

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

        // TODO: If there is already a matching task, should we attempt to update it?
        if (!tasks.tasks.some(t => t.label === label)) {
            tasks.tasks.push(this.createPreLaunchTask(functionName, event, debugPort))
        }

        // If this function is called twice in succession (for instance, if multiple lambdas
        // were detected), multiple calls to mkdirAsync can be added to the event queue,
        // leading to a pseudo-race condition despite node's single-threaded nature.
        await lock.acquire('create .vscode', async () => {
            if (!await fileExists(configRoot)) {
                await filesystem.mkdirAsync(configRoot)
            }
        })

        if (!(await filesystem.statAsync(configRoot)).isDirectory()) {
            throw new Error(`${configRoot} exists, but is not a directory`)
        }

        const config = new DefaultSettingsConfiguration('editor')
        await filesystem.writeFileAsync(
            tasksPath,
            JSON.stringify(tasks, undefined, config.readSetting<number>('tabSize', 4))
        )

        return label
    }

    private createPreLaunchTask(
        functionName: string,
        event: any,
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
                    // TODO: The SAM CLI is not currently (10/30/18) localized. If/when it becomes localized,
                    // these patterns should be updated.
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
