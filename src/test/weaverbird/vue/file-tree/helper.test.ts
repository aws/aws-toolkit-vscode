/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeNode, fileListToTree } from '../../../../weaverbird/vue/file-tree/helpers'
import { MemoryFile } from '../../../../weaverbird/memoryFile'

describe('file-tree helper', function () {
    describe('fileListToTree', function () {
        it('should create changes from no folder', function () {
            const firstFilePath = 'foo.js'
            const firstMemFile = MemoryFile.createDocument(firstFilePath)

            const treeList = fileListToTree([
                {
                    data: firstMemFile,
                    path: firstFilePath,
                },
            ])
            assert.deepStrictEqual(treeList, {
                name: 'Changes',
                type: 'folder',
                children: [
                    {
                        data: firstMemFile,
                        filePath: firstFilePath,
                        name: 'foo.js',
                        type: 'file',
                    },
                ],
            } as TreeNode)
        })

        it('should create changes from paths with dots in them', function () {
            const firstFilePath = 'src/../foo.js'
            const firstMemFile = MemoryFile.createDocument(firstFilePath)

            const treeList = fileListToTree([
                {
                    data: firstMemFile,
                    path: firstFilePath,
                },
            ])
            assert.deepStrictEqual(treeList, {
                name: 'Changes',
                type: 'folder',
                children: [
                    {
                        data: firstMemFile,
                        filePath: firstFilePath,
                        name: '..',
                        type: 'file',
                    },
                ],
            } as TreeNode)
        })

        it('should create changes from multiple folders', function () {
            const firstFilePath = 'project/src/foo.js'
            const firstMemFile = MemoryFile.createDocument(firstFilePath)

            const secondFilePath = 'project/src/fi.js'
            const secondMemFile = MemoryFile.createDocument(secondFilePath)

            const treeList = fileListToTree([
                {
                    data: firstMemFile,
                    path: firstFilePath,
                },
                {
                    data: secondMemFile,
                    path: secondFilePath,
                },
            ])
            assert.deepStrictEqual(treeList, {
                name: 'Changes',
                type: 'folder',
                children: [
                    {
                        name: 'project',
                        type: 'folder',
                        children: [
                            {
                                name: 'src',
                                type: 'folder',
                                children: [
                                    {
                                        data: firstMemFile,
                                        filePath: firstFilePath,
                                        name: 'foo.js',
                                        type: 'file',
                                    },
                                    {
                                        data: secondMemFile,
                                        filePath: secondFilePath,
                                        name: 'fi.js',
                                        type: 'file',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            } as TreeNode)
        })
    })
})
