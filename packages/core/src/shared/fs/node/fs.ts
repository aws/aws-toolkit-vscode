/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import _path from 'path'
import _fsNode from 'fs/promises'
import lockFile, { LockOptions } from 'proper-lockfile'
import { ToolkitError } from '../../errors'
import { toUri } from '../../utilities/uriUtils'

/**
 * FileSystem related methods that only work in Node.js
 */
export class NodeFileSystem {
    protected constructor() {}
    static #instance: NodeFileSystem
    static get instance(): NodeFileSystem {
        return (this.#instance ??= new NodeFileSystem())
    }

    /**
     * Acquires a lock on the given file, then runs the given callback, releasing the lock when done.
     *
     * The reason this is node specific:
     *   - The proper-lockfile module uses the mkdir() method for lockfiles as it behaves as an atomic exists + make lockfile
     *   - But the VSC Filesystem implementation does not throw an error when the lock file (directory) already exists,
     *     so we need to use the node fs module, which does not work in web.
     *
     * @param uri The uri of the file to lock
     * @param lockId Some way to identify who acquired the lock
     * @param callback The callback to run once the lock is acquired
     */
    public async lock(uri: vscode.Uri | string, callback: () => Promise<void>): Promise<void> {
        let release = undefined
        try {
            try {
                const path = toUri(uri).fsPath
                release = await lockFile.lock(path, this.lockOptions)
            } catch (err) {
                if (!(err instanceof Error)) {
                    throw err
                }
                throw ToolkitError.chain(err, `Failed in lock: ${uri}`, { code: 'NodeLockError' })
            }

            try {
                return await callback()
            } catch (err) {
                if (!(err instanceof Error)) {
                    throw err
                }
                throw ToolkitError.chain(err, `Failed in callback of lock: ${uri}`, { code: 'NodeLockError' })
            }
        } finally {
            await release?.()
        }
    }

    protected get lockOptions() {
        const options: LockOptions = {
            stale: 5000, // lockfile becomes stale after this many millis
            update: 1000, // update lockfile mtime every this many millis, useful for a long running callback that exceeds the time
            retries: {
                maxRetryTime: 10_000, // How long to try to acquire the lock before giving up
                minTimeout: 100, // How long to wait between each retrying, but changes with exponential backoff
                factor: 2, // Exponential backoff (doubles each retry)
            },
        }
        return options
    }
}

export const fsNode = NodeFileSystem.instance
export default NodeFileSystem.instance
