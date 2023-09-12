/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type TreeNode = FolderNode | FileNode
export type FileNode = { name: string; type: 'file'; filePath: string }
export type FolderNode = { name: string; type: 'folder'; children: (FolderNode | FileNode)[] }

/*
 * Converts a list of file Paths into a tree
 *
 * @input: The list of `{ path: string }`
 * Example Input: [
 *   {
 *      path: "project/src/hello.js",
 *   },
 *   {
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
 *              { name: 'hello.js', type: 'file', filePath: 'project/src/hello.js' }
 *              { name: 'goodbye.js', type: 'file', filePath: 'project/src/goodbye.js' }
 *          ]
 *      }]
 *  }]
 * }
 */
export const fileListToTree = (filePaths: string[]): TreeNode => {
    return (
        filePaths
            // split file path by folder. ignore dot folders
            .map(path => path.split('/').filter(item => item && item !== '.'))
            .reduce(
                (acc, path) => {
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
