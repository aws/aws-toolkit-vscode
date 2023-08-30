/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryFile } from '../../memoryFile'

export type TreeNode = FolderNode | FileNode
export type FileNode = { name: string; type: 'file'; filePath: string; data: MemoryFile }
export type FolderNode = { name: string; type: 'folder'; children: (FolderNode | FileNode)[] }

/*
 * Converts a list of file Paths into a tree
 *
 * @input: The list of `{ data: MemoryFile, path: string }`
 * Example Input: [
 *   {
 *      data: { content: "console.log('Hello world');", uri: { path: "hello.js" } },
 *      path: "project/src/hello.js",
 *   },
 *   {
 *      data: { content: "console.log('Goodbye, world');", uri: { path: "goodbye.js" } },
 *      path: "project/src/goodbye.js",
 *   }
 * ]
 *
 * Example output:
 * {
 *  name: 'Changes',
 *  type: 'folder',
 *  children: [{
 *      name: 'project',
 *      type: 'folder',
 *      children: [{
 *          name: 'src',
 *          type: 'folder',
 *          children: [
 *              { name: 'hello.js', type: 'file', filePath: 'project/src/hello.js', data: MemoryFile }
 *              { name: 'goodbye.js', type: 'file', filePath: 'project/src/goodbye.js', data: MemoryFile }
 *          ]
 *      }]
 *  }]
 * }
 */
export const fileListToTree = (fileList: { data: MemoryFile; path: string }[]): TreeNode => {
    return (
        fileList
            // split file path by folder. ignore dot folders
            .map(item => ({ ...item, path: item.path.split('/').filter(item => item && item !== '.') }))
            .reduce(
                (acc, { data, path }) => {
                    // pointer to keep track of the current tree node
                    let currentNode = acc
                    for (let i = 0; i < path.length; i++) {
                        const fileOrFolder = path[i]
                        // since dot folders were ignored, a file is identified by having an extension separated by a dot
                        if (fileOrFolder.includes('.')) {
                            // the parent of a file is always a folder
                            ;(currentNode as FolderNode).children.push({
                                type: 'file',
                                name: fileOrFolder,
                                filePath: path.join('/'),
                                data,
                            })
                            break
                        } else {
                            const oldItem = (currentNode as FolderNode).children.find(
                                ({ name }) => name === fileOrFolder
                            )
                            if (oldItem) {
                                currentNode = oldItem
                            } else {
                                // if the current fileOrFolder is not in the list, add it as a folder and move the pointer
                                const newItem: FolderNode = { name: fileOrFolder, type: 'folder', children: [] }
                                ;(currentNode as FolderNode).children.push(newItem)
                                currentNode = newItem
                            }
                        }
                    }
                    return acc
                },
                // Start off with a root folder called Changes
                { name: 'Changes', type: 'folder', children: [] } as TreeNode
            )
    )
}
