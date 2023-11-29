/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitIgnoreAcceptor } from '@gerhobbelt/gitignore-parser'
import { Uri } from 'vscode'
import { SystemUtilities } from '../../shared/systemUtilities'
import { getWorkspaceParentDirectory } from '../../shared/utilities/workspaceUtils'
import * as parser from '@gerhobbelt/gitignore-parser'
import * as path from 'path'
import { isInDirectory } from '../../shared/filesystemUtilities'

type GitIgnoreRelativeAcceptor = {
    folderPath: string
    acceptor: GitIgnoreAcceptor
}

export class GitIgnoreFilter {
    private acceptors: GitIgnoreRelativeAcceptor[]

    private constructor(acceptors: GitIgnoreRelativeAcceptor[]) {
        this.acceptors = acceptors
    }

    public static async build(gitIgnoreFiles: Uri[]): Promise<GitIgnoreFilter> {
        const acceptors: GitIgnoreRelativeAcceptor[] = []
        for (const file of gitIgnoreFiles) {
            const fileContent = await SystemUtilities.readFile(file)

            const folderPath = getWorkspaceParentDirectory(file.fsPath)
            if (folderPath === undefined) {
                continue
            }
            const gitIgnoreAcceptor = parser.compile(fileContent)
            acceptors.push({
                folderPath: folderPath,
                acceptor: gitIgnoreAcceptor,
            })
        }
        return new GitIgnoreFilter(acceptors)
    }

    public filterFiles(files: Uri[]) {
        return files.filter(file =>
            this.acceptors.every(acceptor => {
                if (!isInDirectory(acceptor.folderPath, file.fsPath)) {
                    // .gitignore file is responsible only for it's subfolders
                    return true
                }
                // careful with Windows, if ignore pattern is `build`
                // the library accepts `build\file.js`, but does not accept `build/file.js`
                const systemDependantRelativePath = path.relative(acceptor.folderPath, file.fsPath)
                const posixPath = systemDependantRelativePath.split(path.sep).join(path.posix.sep)
                return acceptor.acceptor.accepts(posixPath)
            })
        )
    }
}
