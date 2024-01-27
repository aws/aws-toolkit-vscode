/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
     * Reads the file's contents. Affected by {@link maxBufferSizeInMB}.
     * @throws If the Git API becomes disabled or we were unable to read the file
     */
    read: () => Promise<string>
}

export interface Repository extends GitTypes.Repository {
    /**
     * Fires whenever the repository's head changes.
     */
    onDidChangeBranch: vscode.Event<GitTypes.Branch | undefined>

    // TODO: add way to check if repository is a 'fresh clone'
    // this will probably require storing state in a memento
    // newRepo: boolean

    // Some other ideas that may be useful at some point:
    // onDidAddRemote: vscode.Event<GitTypes.Remote>
    // onDidRemoveRemote: vscode.Event<GitTypes.Remote>
    // onDidAddTag: vscode.Event<GitTypes.Ref & { type: GitTypes.RefType.Tag }>
    // onDidRemoveTag: vscode.Event<GitTypes.Ref & { type: GitTypes.RefType.Tag }>
}

// there's way too many options to properly type this; best to just add as you go
// also there's not much of a benefit in 'name-spacing' the keys, easier to leave as-is
interface GitConfig {
    ['user.name']?: string
    ['user.email']?: string
    [key: string]: string | undefined
}

const minGitFilterVersion = new SemVer('2.27.0')

// Arbitrary limit for the in-mem buffer when downloading files via `git cat-file`
// This can be increased though for larger files streaming might be a better choice
// See https://github.com/nodejs/node/issues/9829 for a discussion on `maxBuffer`
const maxBufferSizeInMB = 100

function formatBranch(branch?: GitTypes.Branch): string {
    return branch?.name ?? branch?.commit ?? 'unknown'
}

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
    private _api?: GitTypes.API
    private _repositories = new Map<string, Repository>()
    private _onDidOpenRepository = new vscode.EventEmitter<Repository>()
    private _activationPromise?: Thenable<void>
    private static _instance?: GitExtension

    private execFileAsync = promisify(execFile)

    public readonly onDidOpenRepository = this._onDidOpenRepository.event

    public get enabled(): boolean {
        return this._api !== undefined
    }

    // TODO: implement more functionality exposed by git extension
    /**
     * The underlying Git extension API.
     *
     * It is recommended to not use this for production code since it is more difficult to mock/stub.
     * Favor using the wrapped methods as they fail gracefully in scenarios where the user has disabled
     * the git extension or does not have it installed (e.g. unit tests).
     *
     * @throws If the git extension is disabled or not installed
     */
    public get $api(): GitTypes.API {
        if (this._api === undefined) {
            throw new Error('Git extension is not installed or enabled.')
        }
        return this._api
    }

    public static get instance(): GitExtension {
        return GitExtension._instance ?? new GitExtension()
    }

    public get gitPath(): string | undefined {
        return this._api?.git.path
    }

    private constructor() {
        const ext = vscode.extensions.getExtension<GitTypes.GitExtension>(VSCODE_EXTENSION_ID.git)

        if (ext === undefined) {
            getLogger().warn(
                `The "${VSCODE_EXTENSION_ID.git}" extension was not found. Git related features will be disabled.`
            )
            return this
        }

        const setApi = (enabled: boolean) => {
            if (enabled) {
                this._api = ext.exports.getAPI(1)
                this.registerOpenRepositoryListener(this._api)
            } else {
                delete this._api
            }
        }

        this._activationPromise = ext.activate().then(() => {
            setApi(ext.exports.enabled)
            ext.exports.onDidChangeEnablement(setApi)
        })

        GitExtension._instance = this
    }

    // TODO: use `ChildProcess` to execute git
    public executeCommand(): void {}

    private async validateApi(message: string): Promise<GitTypes.API | undefined>
    private async validateApi(message: Error): Promise<GitTypes.API | never>
    private async validateApi(message: string | Error): Promise<GitTypes.API | undefined | never> {
        await this._activationPromise

        if (!this._api) {
            if (message instanceof Error) {
                throw message
            }
            getLogger().verbose(message)
            return
        }

        return this._api
    }

    /**
     * Wrapper for the git extension's `onDidOpenRepository` event.
     *
     * We hook into extension enablement to automatically re-add listeners.
     */
    private registerOpenRepositoryListener(api: GitTypes.API): vscode.Disposable {
        return api.onDidOpenRepository(repo => {
            this._onDidOpenRepository.fire(this.extendRepository(repo))
        })
    }

    /**
     * Adds additional functionality to a git repository object
     *
     * @param repo Repository from the git extension API
     */
    private extendRepository(repo: GitTypes.Repository): Repository {
        const repoPath = repo.rootUri.fsPath.toString()

        if (this._repositories.has(repoPath)) {
            return this._repositories.get(repoPath)!
        }

        const onDidChangeBranchEmitter = new vscode.EventEmitter<GitTypes.Branch | undefined>()

        let previousState = {
            HEAD: JSON.parse(JSON.stringify(repo.state.HEAD ?? { type: GitTypes.RefType.Head })) as GitTypes.Branch,
        }
        repo.state.onDidChange(() => {
            if (previousState.HEAD?.name !== repo.state.HEAD?.name) {
                getLogger().debug(
                    `git: repo "${repoPath}" changed head from "${formatBranch(previousState.HEAD)}" to "${formatBranch(
                        repo.state.HEAD
                    )}"`
                )
                onDidChangeBranchEmitter.fire(repo.state.HEAD)
            }
            previousState = { HEAD: JSON.parse(JSON.stringify(repo.state.HEAD)) }
        })

        const wrapped = Object.assign(Object.create(repo) as GitTypes.Repository, {
            onDidChangeBranch: onDidChangeBranchEmitter.event,
        })
        this._repositories.set(repoPath, wrapped)

        return wrapped
    }

    /**
     * Returns all remotes currently associated with the workspace.
     *
     * If Git is disabled, this returns an empty array.
     */
    public async getRemotes(): Promise<GitTypes.Remote[]> {
        const api = await this.validateApi('git: api is disabled, returning empty array of remotes')
        const remotes: GitTypes.Remote[] = []
        api?.repositories.forEach(repo => remotes.push(...repo.state.remotes))

        return remotes
    }

    public async getRepositories(): Promise<Repository[]> {
        const api = await this.validateApi('git: api is disabled, returning empty array of repositories')
        return api?.repositories.map(repo => this.extendRepository(repo)) ?? []
    }

    /**
     * Returns all branches associated with the specified remote.
     *
     * If the remote does not exist within the current workspace, the branches will be fetched directly
     * using the `fetchUrl` property of the remote. Returns an empty array if Git is disabled.
     */
    public async getBranchesForRemote(remote: GitTypes.Remote): Promise<GitTypes.Branch[]> {
        const api = await this.validateApi('git: api is disabled, returning empty array of branches')
        const branches: GitTypes.Branch[] = []

        if (!api) {
            return branches
        }

        const remotes = api?.repositories
            .map(repo => repo.state.remotes.filter(other => other.fetchUrl === remote.fetchUrl))
            .reduce((a, b) => a.concat(b), [])

        api.repositories.forEach(repo =>
            branches.push(
                ...repo.state.refs.filter(
                    (ref: GitTypes.Ref) =>
                        ref.type === GitTypes.RefType.RemoteHead &&
                        !ref.name?.endsWith('HEAD') &&
                        remotes.some(remote => remote.name === ref.remote)
                )
            )
        )

        getLogger().debug(`git: found ${branches.length} branches from local repositories`)

        // We'll be 'smart' and try to get branches directly if the user is using a URL not associated with
        // their current workspace. Currently no way to sort by the latest commited branch using 'ls-remote'
        // This might be possible with the extension API directly but I could not find anything. Ideally
        // we want to avoid messing with the user's repositories/settings as much as possible.
        //
        // TODO: make a promise 'pipe' function
        if (branches.length === 0) {
            try {
                const { stdout } = await this.execFileAsync(api.git.path, [
                    'ls-remote',
                    '--heads',
                    '--',
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
                    .filter(branch => !!branch.name)
            } catch (err) {
                getLogger().verbose(`git: failed to get branches for remote "${remote.fetchUrl}": %s`, err)
                return []
            }
        }

        return branches
    }

    public async getConfig(repository?: GitTypes.Repository): Promise<GitConfig> {
        const api = await this.validateApi('git: api is disabled, no config found')
        const config: GitConfig = {}

        if (!api) {
            return config
        } else if (repository) {
            ;(await repository.getConfigs()).forEach(({ key, value }) => (config[key] = value))
        } else {
            const { stdout } = await this.execFileAsync(api.git.path, ['config', '--list', `--global`]).catch(err => {
                getLogger().verbose(`git: failed to read config: %s`, err)
                return { stdout: '' }
            })

            stdout
                .toString()
                .split(/\r?\n/)
                .map(l => l.split('='))
                .forEach(([k, v]) => (config[k] = v))
        }

        return config
    }

    public async getVersion(): Promise<SemVer | undefined> {
        const api = await this.validateApi('git: extension disabled, unable to retrieve git version')
        if (!api) {
            return
        }

        try {
            const { stdout } = await this.execFileAsync(api.git.path, ['--version'])
            const match = stdout.trim().match(/[0-9]+.[0-9]+.[0-9]+/g)
            if (!match) {
                throw new Error(`Unable to parse git output for version: ${stdout}`)
            }
            return semverParse(match[0]) as SemVer | undefined
        } catch (err) {
            getLogger().verbose('git: failed to retrieve version: %s', err)
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
    ): Promise<{ files: GitFile[]; dispose(): Promise<boolean>; stats: { downloadSize?: string } }> {
        const api = await this.validateApi(new Error('Cannot list files when the git extension is disabled'))
        const version = await this.getVersion()

        if (version === undefined || version.compare(minGitFilterVersion) === -1) {
            throw new Error(
                `Git version is too low or could not be determined (min=${minGitFilterVersion}): ${
                    version ?? 'unknown'
                }`
            )
        }

        const tmpDir = await makeTemporaryToolkitFolder()
        const args = ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--no-tags', '--progress']
        pushIf(args, remote.branch !== undefined, '--branch', remote.branch).push(remote.fetchUrl, tmpDir)

        try {
            const { stderr } = await this.execFileAsync(api.git.path, args)

            // try to parse some stats from the clone
            const downloadSize = (stderr.match(/Receiving objects: 100% \([0-9]+\/[0-9]+\), (.*)\|/) ?? [])[1]

            const { stdout } = await this.execFileAsync(api.git.path, ['ls-tree', '-r', '-z', 'HEAD'], {
                cwd: tmpDir,
            })

            const files = stdout
                .toString()
                .slice(0, -1) // remove trailing null character
                .split(/\0/)
                .map(s => s.split(/\s/))
                .map(([mode, type, hash, name]) => ({
                    name,
                    read: async () => {
                        const api = await this.validateApi(
                            new Error(`git: api was disabled while reading file "${name}" from "${remote.fetchUrl}"`)
                        )

                        return this.execFileAsync(api.git.path, ['cat-file', type, hash], {
                            cwd: tmpDir,
                            maxBuffer: 1024 * 1024 * maxBufferSizeInMB,
                        }).then(({ stdout }) => stdout)
                    },
                }))

            return { files, dispose: () => tryRemoveFolder(tmpDir), stats: { downloadSize } }
        } catch (err) {
            void tryRemoveFolder(tmpDir)
            throw err
        }
    }

    public async registerRemoteSourceProvider(provider: GitTypes.RemoteSourceProvider): Promise<vscode.Disposable> {
        const api = await this.validateApi('git: extension disabled, unable to register source provider')

        if (!api) {
            return { dispose: () => {} }
        }

        return api.registerRemoteSourceProvider(provider)
    }

    public async registerCredentialsProvider(provider: GitTypes.CredentialsProvider): Promise<vscode.Disposable> {
        const api = await this.validateApi('git: extension disabled, unable to register credentials provider')

        if (!api) {
            return { dispose: () => {} }
        }

        return api.registerCredentialsProvider(provider)
    }
}
