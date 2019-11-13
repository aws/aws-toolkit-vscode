/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import { detectCdkProjects, detectLocalCdkProjects } from '../../cdk/explorer/detectCdkProjects'
import * as filesystem from '../../shared/filesystem'
import { createWorkspaceFolder } from './util'

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('detectCdkProjects', () => {
    const workspacePaths: string[] = []
    const workspaceFolders: vscode.WorkspaceFolder[] = []

    beforeEach(async () => {
        const { workspacePath, workspaceFolder } = await createWorkspaceFolder('vsctk-shiv')

        workspacePaths.push(workspacePath)
        workspaceFolders.push(workspaceFolder)
    })

    afterEach(async () => {
        await del(workspacePaths, { force: true })

        workspacePaths.length = 0
        workspaceFolders.length = 0
    })

    it('detects no projects when workspaceFolders is undefined', async () => {
        const actual = await detectCdkProjects(undefined)

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects no projects when workspaceFolders is empty', async () => {
        const actual = await detectCdkProjects([])

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects no projects when tree.json does not exist', async () => {
        const actual = await detectCdkProjects(workspaceFolders)

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('Detects projects at the root of each workspace folder', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')

        const result = detectLocalCdkProjects({
            workspaceUris: [vscode.Uri.file(workspaceFolderPath)],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    if (_path !== normalizePath(workspaceFolderPath, 'cdk.out/tree.json')) {
                        throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(
                    _path: filesystem.PathLike,
                    options?:
                        | {
                              encoding: BufferEncoding | null
                              withFileTypes?: false
                          }
                        | BufferEncoding
                        | undefined
                        | null
                ): Promise<string[]> {
                    return ['cdk.out/tree.json']
                },

                async stat(_path: filesystem.PathLike): Promise<filesystem.Stats> {
                    return ({
                        isDirectory() {
                            return true
                        }
                    } as any) as filesystem.Stats
                }
            }
        })

        const projects: vscode.Uri[] = []
        for await (const project of result) {
            projects.push(project)
        }

        assert.strictEqual(projects.length, 1)
        assert.strictEqual(projects[0].fsPath, normalizePath(workspaceFolderPath, 'cdk.out/tree.json'))
    })

    it('Detects projects in child folders of each workspace folder', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child')

        const result = detectLocalCdkProjects({
            workspaceUris: [vscode.Uri.file(workspaceFolderPath)],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    if (_path !== normalizePath(workspaceFolderChildPath, 'cdk.out/tree.json')) {
                        throw new Error(`No project found at path: '${_path}'`)
                    }
                },

                async readDir(_path: filesystem.PathLike): Promise<string[]> {
                    switch (_path) {
                        case workspaceFolderPath:
                            return ['child']
                        case workspaceFolderChildPath:
                            return ['cdk.out/tree.json']
                        default:
                            throw new Error(`Unexpected path: '${_path}'`)
                    }
                },

                async stat(_path: filesystem.PathLike): Promise<filesystem.Stats> {
                    return ({
                        isDirectory() {
                            return true
                        }
                    } as any) as filesystem.Stats
                }
            }
        })

        const projects: vscode.Uri[] = []
        for await (const project of result) {
            projects.push(project)
        }

        assert.strictEqual(projects.length, 1)
        assert.strictEqual(projects[0].fsPath, normalizePath(workspaceFolderChildPath, 'cdk.out/tree.json'))
    })

    it('Detects multiple CDK projects when multiple folders contain CDK projects', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
        const workspaceFolderChildPath1 = normalizePath(workspaceFolderPath, 'child1')
        const workspaceFolderChildPath2 = normalizePath(workspaceFolderPath, 'child2')

        const result = detectLocalCdkProjects({
            workspaceUris: [vscode.Uri.file(workspaceFolderPath)],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    switch (_path) {
                        case normalizePath(workspaceFolderChildPath1, 'cdk.out/tree.json'):
                        case normalizePath(workspaceFolderChildPath2, 'cdk.out/tree.json'):
                            return
                        default:
                            throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(_path: filesystem.PathLike): Promise<string[]> {
                    switch (_path) {
                        case workspaceFolderPath:
                            return ['child1', 'child2']
                        case workspaceFolderChildPath1:
                        case workspaceFolderChildPath2:
                            return ['cdk.out/tree.json']
                        default:
                            throw new Error(`Unexpected path: '${_path}'`)
                    }
                },

                async stat(_path: filesystem.PathLike): Promise<filesystem.Stats> {
                    return ({
                        isDirectory() {
                            return true
                        }
                    } as any) as filesystem.Stats
                }
            }
        })

        const projects: vscode.Uri[] = []
        for await (const project of result) {
            projects.push(project)
        }

        assert.strictEqual(projects.length, 2)
        assert.ok(projects.some(t => t.fsPath === normalizePath(workspaceFolderChildPath1, 'cdk.out/tree.json')))
        assert.ok(projects.some(t => t.fsPath === normalizePath(workspaceFolderChildPath2, 'cdk.out/tree.json')))
    })
})
