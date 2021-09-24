/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as GitTypes from '../../../types/git.d'
import { SemVer, parse as semverParse } from 'semver'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../filesystemUtilities'
import { getLogger } from '../logger/logger'
import { pushIf } from '../utilities/collectionUtils'

interface GitFile {
    name: string
    /**
     * Reads the file's contents
     * @throws If the Git API becomes disabled or we were unable to read the file
     */
    read: () => Promise<string>
}

// there's way too many options to properly type this; best to just add as you go
// also there's not much of a benefit in 'name-spacing' the keys, easier to leave as-is
interface GitConfig {
    ['user.name']?: string
    ['user.email']?: string
    [key: string]: string | undefined
}

const execFileAsync = promisify(execFile)
const MIN_GIT_FILTER_VERSION = new SemVer('2.27.0')

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

        const setApi = (enabled: boolean) => (this.api = enabled ? ext.exports.getAPI(1) : undefined)

        // Activate does nothing if already activated
        ext.activate().then(() => {
            setApi(ext.exports.enabled)
            ext.exports.onDidChangeEnablement(setApi)
        })

        if (ext.isActive) {
            setApi(ext.exports.enabled)
        }
    }

    /**
     * Returns all remotes currently associated with the workspace.
     *
     * If Git is disabled, this returns an empty array.
     */
    public getRemotes(): GitTypes.Remote[] {
        if (this.api === undefined) {
            getLogger().verbose('git: api is disabled, returning empty array of remotes')
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
            getLogger().verbose('git: api is disabled, returning empty array of branches')
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
                const { stdout } = await execFileAsync(this.api.git.path, [
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

    public async getConfig(scope: 'global' | 'system' | 'local'): Promise<GitConfig> {
        if (this.api === undefined) {
            getLogger().verbose(`git: api is disabled, no config found`)
            return {}
        }

        const { stdout } = await execFileAsync(this.api.git.path, ['config', '--list', `--${scope}`]).catch(err => {
            getLogger().verbose(`git: failed to read config: %O`, err)
            return { stdout: '' }
        })

        const config: GitConfig = {}
        stdout
            .toString()
            .split(/\r?\n/)
            .map(l => l.split('='))
            .forEach(([k, v]) => (config[k] = v))

        return config
    }

    public async getVersion(): Promise<SemVer | undefined> {
        if (this.api === undefined) {
            getLogger().verbose('git: extension disabled, unable to retrieve git version')
            return
        }

        try {
            const { stdout } = await execFileAsync(this.api.git.path, ['--version'])
            // seems fragile, maybe use regexp instead?
            const version = semverParse(stdout.trim().split(/\s/).pop()) as SemVer | undefined
            if (!version) {
                throw new Error(`Unable to parse git output for version: ${stdout}`)
            }
            return version
        } catch (err) {
            getLogger().verbose('git: failed to retrieve version: %O', err)
        }
    }

    /**
     * Lists all files in the target remote.
     *
     * This requires performing a shallow/sparse clone in a temporary directory. The directory is
     * _not_ cleaned up automatically unless an error is thrown. Call `dispose` on the object if
     * you do not need to read any of the file contents.
     *
     * @throws on everything
     */
    public async listAllRemoteFiles(
        remote: Required<Pick<GitTypes.Remote, 'fetchUrl'>> & { branch?: string }
    ): Promise<{ files: GitFile[]; dispose(): void }> {
        const version = await this.getVersion()

        if (this.api === undefined) {
            throw new Error('Cannot list files when the git extension is disabled')
        }
        if (version === undefined || version.compare(MIN_GIT_FILTER_VERSION) === -1) {
            throw new Error(
                `Git version is too low or could not be determined (min=${MIN_GIT_FILTER_VERSION}): ${
                    version ?? 'unknown'
                }`
            )
        }

        const tmpDir = await makeTemporaryToolkitFolder()
        const args = ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--no-tags']
        pushIf(args, remote.branch !== undefined, '--branch', remote.branch).push(remote.fetchUrl, tmpDir)

        try {
            await execFileAsync(this.api.git.path, args)

            const { stdout } = await execFileAsync(this.api.git.path, ['ls-tree', '-r', '-z', 'HEAD'], {
                cwd: tmpDir,
            })

            const files = stdout
                .toString()
                .slice(0, -1) // remove trailing null character
                .split(/\0/)
                .map(s => s.split(/\s/))
                .map(([mode, type, hash, name]) => ({
                    name,
                    read: () => {
                        if (this.api === undefined) {
                            throw new Error(
                                `git: api was disabled while reading file "${name}" from "${remote.fetchUrl}"`
                            )
                        }

                        return execFileAsync(this.api.git.path, ['cat-file', type, hash], {
                            cwd: tmpDir,
                        }).then(({ stdout }) => stdout)
                    },
                }))

            return { files, dispose: () => tryRemoveFolder(tmpDir) }
        } catch (err) {
            tryRemoveFolder(tmpDir)
            throw err
        }
    }
}
