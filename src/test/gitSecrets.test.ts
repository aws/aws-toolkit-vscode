/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe } from 'mocha'

import { SpawnSyncOptions, spawnSync } from 'child_process'
import * as assert from 'assert'
import { getProjectDir } from './testUtil'
import * as path from 'path'
import { platform } from 'os'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'

/**
 * NOTES:
 * - git-secrets patterns are set in the project's `.git/config` file
 */
describe('git-secrets', function () {
    let accessKeyFilePath: string
    let toolkitProjectDir: string
    let testFixturesPath: string
    let gitSecrets: string // path to the git-secrets executable

    function setupGitSecretsExecutable(gitSecretsExecutablePath: string) {
        if (existsSync(gitSecretsExecutablePath)) {
            console.log('INFO: git-secrets already installed')
            return
        }
        console.log('INFO: Installing git-secrets...')
        runCmd(['mkdir', '-p', path.parse(gitSecretsExecutablePath).dir])
        runCmd([
            'curl',
            '-o',
            gitSecretsExecutablePath,
            'https://raw.githubusercontent.com/awslabs/git-secrets/99d01d58ebcc06e237c0e3f3ff5ae628aeef6aa6/git-secrets',
        ])
        runCmd(['chmod', '+x', gitSecretsExecutablePath])
    }

    /** git-secrets patterns that will not cause a failure during the scan */
    function setAllowListPatterns(gitSecrets: string) {
        const allowListPatterns: string[] = ['"accountId": "123456789012"']

        allowListPatterns.forEach(pattern => {
            // Returns non-zero exit code if pattern already exists
            runCmd([gitSecrets, '--add', '--allowed', pattern], { cwd: toolkitProjectDir, throws: false })
        })
    }

    function setDenyListPatterns(gitSecrets: string) {
        const denyListPatterns: string[] = []

        denyListPatterns.forEach(pattern => {
            // Returns non-zero exit code if pattern already exists
            runCmd([gitSecrets, '--add', pattern], { cwd: toolkitProjectDir, throws: false })
        })
    }

    function deleteFileIfExists(filePath: string) {
        if (existsSync(filePath)) {
            unlinkSync(filePath)
        }
    }

    before(function () {
        if (platform() === 'win32') {
            this.skip()
        }

        toolkitProjectDir = path.join(getProjectDir(), '..', '..')
        testFixturesPath = path.join(toolkitProjectDir, 'src', 'testFixtures', 'bin')
        mkdirSync(testFixturesPath, { recursive: true })

        gitSecrets = path.join(testFixturesPath, 'git-secrets')
        setupGitSecretsExecutable(gitSecrets)

        accessKeyFilePath = path.join(testFixturesPath, 'fileWithAccessKey.ts')
        deleteFileIfExists(accessKeyFilePath)

        // Register all patterns with `git-secrets`
        runCmd([gitSecrets, '--register-aws'], { cwd: toolkitProjectDir })
        setDenyListPatterns(gitSecrets)
        setAllowListPatterns(gitSecrets)
    })

    afterEach(function () {
        deleteFileIfExists(accessKeyFilePath)
    })

    it('ensures no git secrets are found', function () {
        const result = runCmd([gitSecrets, '--scan'], { cwd: toolkitProjectDir })
        assert.strictEqual(result.status, 0, `Failure output: ${result.stderr.toString()}`)
    })

    it('sanity check it finds secrets', function () {
        // Create file in project that has secret key value.
        // Need to build access key string incrementally to not trigger git-secrets.
        const keyValue = 'yAki21XLhAIBiKvyaxr4p/ltr8OxkZTHISISFAKE'
        const mySecretAccessKey = `const x = { "aws_secret_access_key": "${keyValue}" }`
        const fileContent = `
/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

${mySecretAccessKey}
`.trim()
        writeFileSync(accessKeyFilePath, fileContent)

        const result = runCmd([gitSecrets, '--scan', accessKeyFilePath], { cwd: toolkitProjectDir, throws: false })

        assert.strictEqual(result.status, 1)
    })
})

function runCmd(args: string[], options?: SpawnSyncOptions & { throws?: boolean }) {
    const result = spawnSync(args[0], args.slice(1), options)

    const throws = options?.throws ?? true
    if (throws && result.status !== 0) {
        throw new Error(`
-----
Error running: $ ${args.join(' ')}

status: ${result.status}
error: ${result.error?.toString()}
stdout: ${result.stdout?.toString()}
stderr: ${result.stderr?.toString()}
-----`)
    }
    return result
}
