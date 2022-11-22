/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as bytes from 'bytes'
import * as vscode from 'vscode'
import * as GitTypes from '../../../../types/git'
import { GitExtension, Repository } from '../../../shared/extensions/git'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { realpath } from 'fs-extra'
import { execFileSync } from 'child_process'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { getLogger } from '../../../shared/logger/logger'
import { getMinVsCodeVersion } from '../../../../scripts/test/launchTestUtilities' // TODO: don't use stuff from 'scripts'

const TEST_REMOTE_NAME = 'test-origin'
const TEST_REMOTE_URL = 'https://github.com/aws/aws-toolkit-vscode'
const TEST_REMOTE_BRANCH = 'master'
const TEST_REMOTE_HEAD = 'v1.32.0'
const TEST_TIMEOUT = 1000

const CONFIG_KEY = 'aws.test'

// performance benchmarks
const LIST_REMOTE_TIMEOUT = 5000
const LIST_REMOTE_MAX_SIZE = 100000

/**
 * Error emitted by the git extension. This is undocumented!
 */
interface GitError {
    gitArgs: string[]
    gitCommand: string
    gitErrorCode?: number
    stdout: string
    stderr: string
    exitCode: GitTypes.GitErrorCodes
}

describe('GitExtension', function () {
    let testRepo: GitTypes.Repository
    const git = GitExtension.instance

    // best effort guess
    function isGitError(obj: any): obj is GitError {
        return obj !== undefined && typeof obj.gitCommand === 'string'
    }

    // output the actual error for debugging
    function parseGitError(err: any): never {
        if (isGitError(err)) {
            throw new Error(`git command "${err.gitArgs.join(' ')}" failed:\n${err.stdout}`)
        }
        throw new Error('Unable to parse git error')
    }

    /* Sets up username/email if it doesn't already exist */
    async function initConfig(): Promise<void> {
        const config = await git.getConfig()
        if (!config['user.name']) {
            execFileSync(git.$api.git.path, ['config', '--global', 'user.name', 'test-name'])
        }
        if (!config['user.email']) {
            execFileSync(git.$api.git.path, ['config', '--global', 'user.email', 'test-email'])
        }
    }

    before(async function () {
        // extension is missing some functionality on the minimum version
        if (vscode.version === getMinVsCodeVersion()) {
            this.test?.skip()
        }

        // API may not be initialized by the time this test starts
        await new Promise<string | void>(r => (git.$api.state === 'initialized' ? r() : git.$api.onDidChangeState(r)))
        await initConfig()

        // realpath is used in case of symlinks
        const tmpDirUri = vscode.Uri.file(await realpath(await makeTemporaryToolkitFolder()))
        const repo = await git.$api.init(tmpDirUri).catch(parseGitError)
        if (!repo) {
            throw new Error(`Failed to create test repository: ${tmpDirUri.fsPath}`)
        }

        testRepo = repo
        await testRepo.addRemote(TEST_REMOTE_NAME, TEST_REMOTE_URL)

        // make a single commit on 'master' to refer back to
        await testRepo.commit('test', { empty: true }).catch(parseGitError)
    })

    after(function () {
        try {
            execFileSync(git.$api.git.path, ['config', '--global', '--unset', CONFIG_KEY])
        } catch (err) {
            getLogger().warn(`Unable to unset test git config value ${CONFIG_KEY}: %s`, err)
        }
    })

    it('can detect opening a repository', async function () {
        const newRepoUri = vscode.Uri.file(await realpath(await makeTemporaryToolkitFolder()))
        const onOpen = new Promise<Repository>((resolve, reject) => {
            git.onDidOpenRepository(repo => {
                if (repo.rootUri.fsPath === newRepoUri.fsPath) {
                    resolve(repo)
                }
            })
            setTimeout(() => reject(new Error('Timed out waiting for repository to open')), TEST_TIMEOUT)
        })
        await git.$api.init(newRepoUri).catch(parseGitError)
        await git.$api.openRepository(newRepoUri).catch(parseGitError)
        await onOpen
    })

    it('can detect changed branch', async function () {
        const wrapped = (await git.getRepositories()).find(r => r.rootUri.fsPath === testRepo.rootUri.fsPath)
        if (!wrapped) {
            throw new Error('Failed to find repository')
        }
        const checkBranch = new Promise<GitTypes.Branch | undefined>((resolve, reject) => {
            wrapped.onDidChangeBranch(branch => {
                resolve(branch)
            })
            setTimeout(() => reject(new Error('Timed out waiting for branch to change')), TEST_TIMEOUT)
        })
        await testRepo.createBranch('new', true).catch(parseGitError)
        assert.strictEqual((await checkBranch)?.name, 'new')
    })

    it('can get version', async function () {
        const version = await git.getVersion()
        assert.ok(version, 'Expected version to not be undefined')
    })

    it('can list remotes and branches', async function () {
        const TARGET_BRANCH = `${TEST_REMOTE_NAME}/${TEST_REMOTE_BRANCH}`
        const remote = (await git.getRemotes()).find(r => r.name === TEST_REMOTE_NAME)
        assert.ok(remote, `Did not find "${TEST_REMOTE_NAME}" in list of remotes`)
        await testRepo.fetch({ remote: TEST_REMOTE_NAME, ref: TEST_REMOTE_BRANCH }).catch(parseGitError)
        const branch = (await git.getBranchesForRemote(remote)).find(branch => branch.name === TARGET_BRANCH)
        assert.ok(branch, `Failed to find "${TARGET_BRANCH}" associated with remote`)
    })

    it('can get repository config', async function () {
        testRepo.setConfig('user.name', 'name')
        testRepo.setConfig('user.email', 'email')
        const config = await git.getConfig(testRepo).catch(parseGitError)
        assert.strictEqual(config['user.name'], 'name')
        assert.strictEqual(config['user.email'], 'email')
    })

    it('can get global config', async function () {
        execFileSync(git.$api.git.path, ['config', '--global', 'aws.test', 'value'])
        await sleep(1000) // mitigate race condition, proper way would be to wait until lock file disappears
        const config = await git.getConfig().catch(parseGitError)
        assert.strictEqual(config['aws.test'], 'value')
    })

    it('can list files from a remote', async function () {
        this.timeout(LIST_REMOTE_TIMEOUT)
        const result = await git.listAllRemoteFiles({ fetchUrl: TEST_REMOTE_URL, branch: TEST_REMOTE_HEAD })

        const readme = result.files.find(f => f.name === 'NOTICE')
        assert.ok(readme, 'Expected to find NOTICE file in repository root')
        const contents = await readme.read()
        assert.ok(contents.startsWith('AWS Vscode Toolkit'))
        const extension = result.files.find(f => f.name === 'src/extension.ts')
        assert.ok(extension, 'Expected to find "extension.ts" under "src"')

        if (!result.stats.downloadSize) {
            throw new Error('Download size was unable to be determined.')
        }

        assert.ok(bytes(result.stats.downloadSize) < LIST_REMOTE_MAX_SIZE)
        assert.ok(await result.dispose())
        await assert.rejects(extension.read)
    })
})
