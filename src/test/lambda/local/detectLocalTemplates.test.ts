/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { detectLocalTemplates } from '../../../lambda/local/detectLocalTemplates'
import * as filesystem from '../../../shared/filesystem'

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('detectLocalTemplates', async () => {
    it('Detects no templates when there are no workspace folders', async () => {
        for await (const template of detectLocalTemplates({ workspaceUris: []})) {
            assert.fail(`Expected no templates, but found '${template.fsPath}'`)
        }
    })

    it('Detects templates at the root of each workspace folder', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')

        const result = detectLocalTemplates({
            workspaceUris: [ vscode.Uri.file(workspaceFolderPath) ],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    if (_path !== normalizePath(workspaceFolderPath, 'template.yaml')) {
                        throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(
                    _path: filesystem.PathLike,
                    options?: {
                        encoding: BufferEncoding | null
                        withFileTypes?: false
                    } | BufferEncoding | undefined | null
                ): Promise<string[]> {
                    return [ 'template.yaml' ]
                },

                async stat(
                    _path: filesystem.PathLike
                ): Promise<filesystem.Stats> {
                    return {
                        isDirectory() {
                            return true
                        }
                    } as any as filesystem.Stats
                }
            }
        })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 1)
        assert.strictEqual(templates[0].fsPath, normalizePath(workspaceFolderPath, 'template.yaml'))
    })

    it('Detects templates in child folders of each workspace folder', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child')

        const result = detectLocalTemplates({
            workspaceUris: [ vscode.Uri.file(workspaceFolderPath) ],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    if (_path !== normalizePath(workspaceFolderChildPath, 'template.yaml')) {
                        throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(
                    _path: filesystem.PathLike
                ): Promise<string[]> {
                    switch (_path) {
                        case workspaceFolderPath:
                            return [ 'child' ]
                        case workspaceFolderChildPath:
                            return [ 'template.yaml' ]
                        default:
                            throw new Error(`Unexpected path: '${_path}'`)
                    }
                },

                async stat(
                    _path: filesystem.PathLike
                ): Promise<filesystem.Stats> {
                    return {
                        isDirectory() {
                            return true
                        }
                    } as any as filesystem.Stats
                }
            }
        })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 1)
        assert.strictEqual(templates[0].fsPath, normalizePath(workspaceFolderChildPath, 'template.yaml'))
    })

    it('Does not recursively descend past the direct children of each workspace folder', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child')
        const workspaceFolderGrandchildPath = normalizePath(workspaceFolderChildPath, 'grandchild')

        const result = detectLocalTemplates({
            workspaceUris: [ vscode.Uri.file(workspaceFolderPath) ],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    if (_path !== normalizePath(workspaceFolderGrandchildPath, 'template.yaml')) {
                        throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(_path: filesystem.PathLike): Promise<string[]> {
                    switch (_path) {
                        case workspaceFolderPath:
                            return [ 'child' ]
                        case workspaceFolderChildPath:
                            return [ 'grandchild' ]
                        case workspaceFolderGrandchildPath:
                            return [ 'template.yaml' ]
                        default:
                            throw new Error(`Unexpected path: '${_path}'`)
                    }
                },

                async stat(_path: filesystem.PathLike): Promise<filesystem.Stats> {
                    return {
                        isDirectory() {
                            return true
                        }
                    } as any as filesystem.Stats
                }
            }
        })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 0)
    })

    it('Detects multiple templates when multiple folders contain templates', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
        const workspaceFolderChildPath1 = normalizePath(workspaceFolderPath, 'child1')
        const workspaceFolderChildPath2 = normalizePath(workspaceFolderPath, 'child2')

        const result = detectLocalTemplates({
            workspaceUris: [ vscode.Uri.file(workspaceFolderPath) ],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    switch (_path) {
                        case normalizePath(workspaceFolderChildPath1, 'template.yaml'):
                        case normalizePath(workspaceFolderChildPath2, 'template.yaml'):
                            return
                        default:
                            throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(
                    _path: filesystem.PathLike
                ): Promise<string[]> {
                    switch (_path) {
                        case workspaceFolderPath:
                            return [ 'child1', 'child2' ]
                        case workspaceFolderChildPath1:
                        case workspaceFolderChildPath2:
                            return [ 'template.yaml' ]
                        default:
                            throw new Error(`Unexpected path: '${_path}'`)
                    }
                },

                async stat(_path: filesystem.PathLike): Promise<filesystem.Stats> {
                    return {
                        isDirectory() {
                            return true
                        }
                    } as any as filesystem.Stats
                }
            }
        })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 2)
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath1, 'template.yaml')))
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath2, 'template.yaml')))

    })

    it('Detects multiple templates when both template.yml and template.yaml exist in a folder', async () => {
        const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child')

        const result = detectLocalTemplates({
            workspaceUris: [ vscode.Uri.file(workspaceFolderPath) ],
            context: {
                async access(_path: filesystem.PathLike): Promise<void> {
                    switch (_path) {
                        case normalizePath(workspaceFolderChildPath, 'template.yml'):
                        case normalizePath(workspaceFolderChildPath, 'template.yaml'):
                            return
                        default:
                            throw new Error(`No file found at path: '${_path}'`)
                    }
                },

                async readDir(_path: filesystem.PathLike): Promise<string[]> {
                    switch (_path) {
                        case workspaceFolderPath:
                            return [ 'child' ]
                        case workspaceFolderChildPath:
                            return [ 'template.yml', 'template.yaml' ]
                        default:
                            throw new Error(`Unexpected path: '${_path}'`)
                    }
                },

                async stat(_path: filesystem.PathLike): Promise<filesystem.Stats> {
                    return {
                        isDirectory() {
                            return true
                        }
                    } as any as filesystem.Stats
                }
            }
        })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 2)
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath, 'template.yaml')))
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath, 'template.yml')))
    })
})
