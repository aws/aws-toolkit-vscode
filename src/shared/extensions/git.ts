/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as vscode from 'vscode'
import * as GitTypes from '../../../types/git.d'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { getLogger } from '../logger/logger'

/**
 * Wrapper around the internal VS Code Git extension.
 *
 * The Git extension is a special case in that its {@link GitTypes.API API} has an additional 'enablement'
 * mechanism where-in the extension may be active, but its features have intentionally been disabled by the user.
 * The current implementation 'silenty' (it still logs something) fails when the API is disabled since the common
 * case uses these methods supplementary to other functionality rather than as a dependency. A caller can always
 * check the `enabled` field to decisively determine if the extension is active.
 */
export class GitExtension {
    private api?: GitTypes.API

    public get enabled(): boolean {
        return this.api !== undefined
    }

    public constructor() {
        const ext = vscode.extensions.getExtension<GitTypes.GitExtension>(VSCODE_EXTENSION_ID.git)

        if (ext === undefined) {
            getLogger().info(
                `The "${VSCODE_EXTENSION_ID.git}" extension was not found. Git related features will be disabled.`
            )
            return
        }

        ext.activate().then(() => {
            this.api = ext.exports.enabled ? ext.exports.getAPI(1) : undefined
            ext.exports.onDidChangeEnablement(enabled => {
                this.api = enabled ? ext.exports.getAPI(1) : undefined
            })
        })
    }

    /**
     * Returns all remotes currently associated with the workspace.
     *
     * If Git is disabled, this returns an empty array.
     */
    public getRemotes(): GitTypes.Remote[] {
        if (this.api === undefined) {
            getLogger().verbose(`git: api is disabled, returning empty array of remotes`)
            return []
        }

        const remotes: GitTypes.Remote[] = []
        this.api.repositories.forEach(repo => remotes.push(...repo.state.remotes))
        return remotes
    }

    /**
     * Returns all branches associated with the specified remote.
     *
     * If the remote does not exist within the current workspace, the branches will be fetched directly
     * using the `fetchUrl` property of the remote. Returns an empty array if Git is disabled.
     */
    public async getBranchesForRemote(remote: GitTypes.Remote): Promise<GitTypes.Branch[]> {
        if (this.api === undefined) {
            getLogger().verbose(`git: api is disabled, returning empty array of branches`)
            return []
        }

        const branches: GitTypes.Branch[] = []

        const repos = this.api.repositories.filter(
            repo => repo.state.remotes.filter(other => other.fetchUrl === remote.fetchUrl).length > 0
        )

        repos.forEach(repo =>
            branches.push(
                ...repo.state.refs.filter(
                    (ref: GitTypes.Ref) => ref.type === GitTypes.RefType.RemoteHead && !ref.name?.endsWith('HEAD')
                )
            )
        )

        // We'll be 'smart' and try to get branches directly if the user is using a URL not associated with
        // their current workspace. Currently no way to sort by the latest commited branch using 'ls-remote'
        // This might be possible with the extension API directly but I could not find anything. Ideally
        // we want to avoid messing with the user's repositories/settings as much as possible.
        //
        // TODO: make a promise 'pipe' function
        if (branches.length === 0) {
            try {
                const { stdout } = await promisify(execFile)(this.api.git.path, [
                    'ls-remote',
                    '--heads',
                    remote.fetchUrl ?? '',
                ])
                return stdout
                    .toString()
                    .split(/\r?\n/)
                    .map(branch => ({
                        name: branch.replace(/.*refs\/heads\//, 'head/'),
                        remote: remote.name,
                        type: GitTypes.RefType.RemoteHead,
                    }))
            } catch (err) {
                getLogger().verbose(`git: failed to get branches for remote "${remote.fetchUrl}": %O`, err)
                return []
            }
        }

        return branches
    }
}
