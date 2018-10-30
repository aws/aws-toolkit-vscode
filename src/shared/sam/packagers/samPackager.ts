/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as archiver from 'archiver'
import * as fs from 'fs'
import { SystemUtilities } from '../../../shared/systemUtilities'

export class SamPackager {

    private readonly _folderMap: { [key: string]: string } = {}

    public withFolder(
        folder: string,
        relativePath: string
    ): SamPackager {
        this._folderMap[folder] = relativePath

        return this
    }

    public async package(filename: string): Promise<void> {
        await this.validate()

        const output = fs.createWriteStream(filename)
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        })

        return new Promise<void>(async (resolve, reject) => {
            // see https://archiverjs.com/docs/ for archiverjs event samples/explanation

            // zip creation completed
            output.on('close', () => {
                resolve()
            })

            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') {
                    // log warning
                } else {
                    // throw error
                    throw err
                }
            })

            archive.on('error', (err) => {
                throw err
            })

            // setup archive to write to zip
            archive.pipe(output)

            // add folders to zip
            Object.keys(this._folderMap).forEach(folder => {
                archive.directory(folder, this._folderMap[folder])
            })

            archive.finalize()
        })
    }

    private async validate(): Promise<void> {
        await this.validateFoldersExist()
        await this.validateFoldersAreNotFiles()
    }

    private async validateFoldersAreNotFiles(): Promise<void> {
        const invalidFolders: string[] = Object.keys(this._folderMap)
            // TODO : CC : make an Async version of lstatSync
            .filter(folder => !fs.lstatSync(folder).isDirectory())

        if (invalidFolders.length > 0) {
            throw new Error(`One or more invalid folders were detected: ${invalidFolders.join(', ')}`)
        }
    }

    private async validateFoldersExist(): Promise<void> {
        const missingFolders: boolean[] = (await Promise.all(
            Object.keys(this._folderMap)
                .map(folder => SystemUtilities.fileExists(folder))
        )).filter(result => !result)

        if (missingFolders.length > 0) {
            throw new Error(`The following folders do not exist: ${missingFolders.join(', ')}`)
        }
    }
}
