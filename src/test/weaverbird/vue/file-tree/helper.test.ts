/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeNode, fileListToTree } from '../../../../weaverbird/vue/file-tree/helpers'

describe('file-tree helper', function () {
    describe('fileListToTree', function () {
        it('should create changes from no folder', function () {
            const firstFilePath = 'foo.js'

            const treeList = fileListToTree([firstFilePath])
            assert.deepStrictEqual(treeList, {
                name: 'Changes',
                type: 'folder',
                children: [
                    {
                        filePath: firstFilePath,
                        name: 'foo.js',
                        type: 'file',
                    },
                ],
            } as TreeNode)
        })

        it('should create changes from paths with dots in them', function () {
            const firstFilePath = 'src/./foo.js'

            const treeList = fileListToTree([firstFilePath])
            assert.deepStrictEqual(treeList, {
                name: 'Changes',
                type: 'folder',
                children: [
                    {
                        name: 'src',
                        type: 'folder',
                        children: [
                            {
                                name: 'foo.js',
                                type: 'file',
                                filePath: 'src/foo.js',
                            },
                        ],
                    },
                ],
            } as TreeNode)
        })

        it('should create changes from multiple folders', function () {
            const firstFilePath = 'project/src/foo.js'
            const secondFilePath = 'project/src/fi.js'

            const treeList = fileListToTree([firstFilePath, secondFilePath])
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
                                        filePath: firstFilePath,
                                        name: 'foo.js',
                                        type: 'file',
                                    },
                                    {
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
