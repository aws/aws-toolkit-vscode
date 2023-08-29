/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe } from 'mocha'

import assert from 'assert'
import * as path from 'path'
import { platform } from 'os'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { runCmd } from './testUtils'

/**
 * NOTES:
 * - git-secrets patterns are set in the project's `.git/config` file
 */
describe('git-secrets', function () {
    let accessKeyFilePath: string
    let toolkitProjectDir: string
    let testFixturesPath: string
    let gitSecrets: string // path to the git-secrets executable

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

    function setupTestFixturesDir(toolkitProjectDir: string) {
        const testFixturesPath = path.join(toolkitProjectDir, 'src', 'testFixtures', 'bin')
        mkdirSync(testFixturesPath, { recursive: true })
        return testFixturesPath
    }

    function setupAccessKeyFile(testFixturesPath: string) {
        const accessKeyFilePath = path.join(testFixturesPath, 'fileWithAccessKey.ts')
        deleteFileIfExists(accessKeyFilePath)
        return accessKeyFilePath
    }

    function setupGitSecretsExecutable(testFixturesPath: string) {
        const gitSecretsExecutablePath = path.join(testFixturesPath, 'git-secrets')

        if (existsSync(gitSecretsExecutablePath)) {
            console.log('INFO: git-secrets already installed')
        } else {
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

        return gitSecretsExecutablePath
    }

    function deleteFileIfExists(filePath: string) {
        if (existsSync(filePath)) {
            unlinkSync(filePath)
        }
    }

    function createFileWithSecretKey(accessKeyFilePath: string) {
        // Create file in project that has secret key value.
        // Need to build access key string incrementally to not trigger git-secrets.
        const keyValue = 'yAki21XLhAIBiKvyaxr4p/ltr8OxkZTHISISFAKE'
        const mySecretAccessKey = `const x = { "aws_secret_access_key": "${keyValue}" }`
        const fileContent = `
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

${mySecretAccessKey}
`.trim()
        writeFileSync(accessKeyFilePath, fileContent)
    }

    before(function () {
        if (platform() === 'win32') {
            this.skip()
        }

        toolkitProjectDir = path.resolve()
        testFixturesPath = setupTestFixturesDir(toolkitProjectDir)
        gitSecrets = setupGitSecretsExecutable(testFixturesPath)
        accessKeyFilePath = setupAccessKeyFile(testFixturesPath)

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
        createFileWithSecretKey(accessKeyFilePath)
        const result = runCmd([gitSecrets, '--scan', accessKeyFilePath], { cwd: toolkitProjectDir, throws: false })
        assert.strictEqual(result.status, 1)
    })
})
