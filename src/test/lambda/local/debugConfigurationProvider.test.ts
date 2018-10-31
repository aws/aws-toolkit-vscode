/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import { NodeDebugConfigurationProvider } from '../../../lambda/local/debugConfigurationProvider'
import * as filesystem from '../../../shared/filesystem'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { createWorkspaceFolder, saveTemplate } from './util'

describe('NodeDebugConfigurationProvider', () => {
    let workspacePath: string
    let workspaceFolder: vscode.WorkspaceFolder
    let templatePath: string

    beforeEach(async () => {
        const tempWorkspace = await createWorkspaceFolder('vsctk')

        workspacePath = tempWorkspace.workspacePath
        workspaceFolder = tempWorkspace.workspaceFolder
        templatePath = path.join(workspacePath, 'template.yaml')
    })

    afterEach(async () => {
        await del([ workspacePath ], { force: true })
    })

    describe('configurations', () => {
        describe('type', () => {
            it('uses the built-in NodeJS debugger', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    assert.equal(configuration.type, 'node')
                }
            })
        })

        describe('request', () => {
            it('provides a launch configuration for each lambda', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction1', 'MyFunction2')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = (await provider.provideDebugConfigurations(workspaceFolder))
                    .filter(c => c.request === 'launch')

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                assert.equal(configurations.filter(c => c.name.includes('MyFunction1')).length, 1)
                assert.equal(configurations.filter(c => c.name.includes('MyFunction2')).length, 1)
            })

            it('provides an attach configuration for each lambda', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction1', 'MyFunction2')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = (await provider.provideDebugConfigurations(workspaceFolder))
                    .filter(c => c.request === 'attach')

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                assert.equal(configurations.filter(c => c.name.includes('MyFunction1')).length, 1)
                assert.equal(configurations.filter(c => c.name.includes('MyFunction2')).length, 1)
            })
        })

        describe('preLaunchTask', () => {
            it('uses the task that invokes SAM local for launch configurations', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = (await provider.provideDebugConfigurations(workspaceFolder))
                    .filter(c => c.request === 'launch')

                assert.ok(configurations)
                assert.equal(configurations.length, 1)
                assert.ok(configurations[0].preLaunchTask)
                assert.equal(configurations[0].preLaunchTask!.includes('MyFunction'), true)
            })

            it('does not include a pre-launch task for attach configurations', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = (await provider.provideDebugConfigurations(workspaceFolder))
                    .filter(c => c.request === 'attach')

                assert.ok(configurations)
                assert.equal(configurations.length, 1)
                assert.equal(configurations[0].preLaunchTask, undefined)
            })
        })

        describe('localRoot', () => {
            it('uses the workspace folder if it contains package.json', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')
                await filesystem.writeFileAsync(path.join(workspacePath, 'package.json'), '')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    // tslint:disable-next-line:no-invalid-template-strings
                    assert.equal(configuration.localRoot, '${workspaceFolder}')
                }
            })

            it('uses a workspace subfolder if it contains package.json', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const subfolderPath = path.join(workspacePath, 'my_app')
                await filesystem.mkdirAsync(subfolderPath)
                await filesystem.writeFileAsync(path.join(subfolderPath, 'package.json'), '')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    // tslint:disable-next-line:no-invalid-template-strings
                    assert.equal(configuration.localRoot, path.join('${workspaceFolder}', '/my_app'))
                }
            })

            it('defaults to the workspace folder if no package.json is found', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    // tslint:disable-next-line:no-invalid-template-strings
                    assert.equal(configuration.localRoot, '${workspaceFolder}')
                }
            })

            it('defaults to the workspace folder if package.json is more than one level deep', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const childFolder = path.join(workspacePath, 'child')
                const grandchildFolder = path.join(childFolder, 'grandchild')

                await filesystem.mkdirAsync(childFolder)
                await filesystem.mkdirAsync(grandchildFolder)
                await filesystem.writeFileAsync(path.join(grandchildFolder, 'package.json'), '')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    // tslint:disable-next-line:no-invalid-template-strings
                    assert.equal(configuration.localRoot, '${workspaceFolder}')
                }
            })

            it('defaults to the workspace folder if multiple subfolders contain package.json', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const childFolder1 = path.join(workspacePath, 'child1')
                const childFolder2 = path.join(workspacePath, 'child2')

                await filesystem.mkdirAsync(childFolder1)
                await filesystem.mkdirAsync(childFolder2)
                await filesystem.writeFileAsync(path.join(childFolder1, 'package.json'), '')
                await filesystem.writeFileAsync(path.join(childFolder2, 'package.json'), '')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    // tslint:disable-next-line:no-invalid-template-strings
                    assert.equal(configuration.localRoot, '${workspaceFolder}')
                }
            })
        })

        describe('skipFiles', () => {
            it('ignores runtime files that only exist on the container', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    assert.ok(configuration.skipFiles)
                    assert.equal(
                        configuration.skipFiles!.filter(f => f === '/var/runtime/node_modules/**/*.js').length,
                        1
                    )
                }
            })
            it('ignores node internal files', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = await provider.provideDebugConfigurations(workspaceFolder)

                assert.ok(configurations)
                assert.equal(configurations.length, 2)

                for (const configuration of configurations) {
                    assert.ok(configuration)
                    assert.ok(configuration.skipFiles)
                    assert.equal(
                        configuration.skipFiles!.filter(f => f === '<node_internals>/**/*.js').length,
                        1
                    )
                }
            })
        })
    })

    describe('tasks', () => {
        describe('label', () => {
            it('matches the value of preLaunchTask for the corresponding launch configuration', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                const configurations = (await provider.provideDebugConfigurations(workspaceFolder))
                    .filter(c => c.request === 'launch')

                assert.ok(configurations)
                assert.equal(configurations.length, 1)

                const configuration = configurations[0]
                assert.ok(configuration)

                const tasksPath = path.join(workspacePath, '.vscode', 'tasks.json')
                const tasks = JSON.parse(await readFileAsString(tasksPath)) as {
                    tasks: {
                        label: string
                    }[]
                }

                assert.ok(tasks)
                assert.ok(tasks.tasks)
                assert.equal(tasks.tasks.length, 1)

                const task = tasks.tasks[0]
                assert.ok(task)
                assert.ok(task.label)
                assert.equal(task.label, configuration.preLaunchTask)
            })
        })

        describe('args', () => {
            it('specifies the json event as a bash-escaped string', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                await provider.provideDebugConfigurations(workspaceFolder, undefined, {
                    escapeMe: "'",
                    doNotEscapeMe: '"'
                })

                const tasksPath = path.join(workspacePath, '.vscode', 'tasks.json')
                const tasks = JSON.parse(await readFileAsString(tasksPath)) as {
                    tasks: {
                        args: string[]
                    }[]
                }

                assert.ok(tasks)
                assert.equal(tasks.tasks.length, 1)

                const task = tasks.tasks[0]
                assert.ok(task)
                assert.ok(task.args)
                assert.equal(task.args.length > 0, true)
                assert.equal(task.args[0], "'{\"escapeMe\":\"'\"'\"'\",\"doNotEscapeMe\":\"\\\"\"}'")
            })

            it('specifies a debug port', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                await provider.provideDebugConfigurations(workspaceFolder, undefined, {
                    escapeMe: "'",
                    doNotEsacpeMe: '"'
                })

                const tasksPath = path.join(workspacePath, '.vscode', 'tasks.json')
                const tasks = JSON.parse(await readFileAsString(tasksPath)) as {
                    tasks: {
                        args: string[]
                    }[]
                }

                assert.ok(tasks)
                assert.equal(tasks.tasks.length, 1)

                const task = tasks.tasks[0]
                assert.ok(task)
                assert.ok(task.args)

                const args: string = task.args.join(' ')
                assert.equal(args.includes('-d 5858'), true)
            })
        })

        describe('windows', () => {
            describe('args', () => {
                it('specifies the json event as a powershell-escaped string', async () => {
                    await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                    const provider = new NodeDebugConfigurationProvider()
                    await provider.provideDebugConfigurations(workspaceFolder, undefined, {
                        escapeMe: "'",
                        doNotEscapeMe: '"'
                    })

                    const tasksPath = path.join(workspacePath, '.vscode', 'tasks.json')
                    const tasks = JSON.parse(await readFileAsString(tasksPath)) as {
                        tasks: {
                            windows: {
                                args: string[]
                            }
                        }[]
                    }

                    assert.ok(tasks)
                    assert.equal(tasks.tasks.length, 1)

                    const task = tasks.tasks[0]
                    assert.ok(task)
                    assert.ok(task.windows)
                    assert.ok(task.windows.args)
                    assert.equal(task.windows.args.length > 0, true)
                    assert.equal(task.windows.args[0], "'{\"escapeMe\":\"''\",\"doNotEscapeMe\":\"\\\"\"}'")
                })

                it('specifies a debug port', async () => {
                    await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                    const provider = new NodeDebugConfigurationProvider()
                    await provider.provideDebugConfigurations(workspaceFolder, undefined, {
                        escapeMe: "'",
                        doNotEsacpeMe: '"'
                    })

                    const tasksPath = path.join(workspacePath, '.vscode', 'tasks.json')
                    const tasks = JSON.parse(await readFileAsString(tasksPath)) as {
                        tasks: {
                            windows: {
                                args: string[]
                            }
                        }[]
                    }

                    assert.ok(tasks)
                    assert.equal(tasks.tasks.length, 1)

                    const task = tasks.tasks[0]
                    assert.ok(task)
                    assert.ok(task.windows.args)
                    assert.ok(task.windows.args)

                    const args: string = task.windows.args.join(' ')
                    assert.equal(args.includes('-d 5858'), true)
                })
            })
        })

        describe('problemMatcher', () => {
            it('includes a background watcher', async () => {
                await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')

                const provider = new NodeDebugConfigurationProvider()
                await provider.provideDebugConfigurations(workspaceFolder, undefined, {
                    escapeMe: "'",
                    doNotEsacpeMe: '"'
                })

                const tasksPath = path.join(workspacePath, '.vscode', 'tasks.json')
                const tasks = JSON.parse(await readFileAsString(tasksPath)) as {
                    tasks: {
                        isBackground?: boolean
                        problemMatcher: {
                            background: {
                                activeOnStart: true
                                beginsPattern: string
                                endsPattern: string
                            }
                        }
                    }[]
                }

                assert.ok(tasks)
                assert.equal(tasks.tasks.length, 1)

                const task = tasks.tasks[0]
                assert.ok(task)
                assert.equal(task.isBackground, true)
                assert.ok(task.problemMatcher)
                assert.ok(task.problemMatcher.background)
                assert.equal(task.problemMatcher.background.activeOnStart, true)
                assert.ok(task.problemMatcher.background.beginsPattern)
                assert.ok(task.problemMatcher.background.endsPattern)
            })
        })
    })
})
