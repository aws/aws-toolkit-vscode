/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { Runtime } from '@aws-sdk/client-lambda'
import { RuntimeFamily } from '../../../../lambda/models/samLambdaRuntime'
import { makePythonDebugConfig } from '../../../../shared/sam/debugger/pythonSamDebug'
import { SamLaunchRequestArgs } from '../../../../shared/sam/debugger/awsSamDebugger'
import { AWS_SAM_DEBUG_TYPE, CODE_TARGET_TYPE } from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import * as pathutil from '../../../../shared/utilities/pathUtils'
import * as testutil from '../../../testUtil'
import { fs } from '../../../../shared'

describe('pythonSamDebug: requirements.txt handling (python3.14-plain-sam-app fixture)', function () {
    // This fixture's `hello_world/requirements.txt` was updated to pin `urllib3` (via a Snyk
    // recommendation) in addition to the pre-existing `requests` dependency. These tests verify
    // that the new fixture content is read/consumed correctly when generating the Python debug
    // manifest (the only code path that reads this file).
    const appDir = pathutil.normalize(
        path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/python3.14-plain-sam-app')
    )
    const codeRoot = pathutil.normalize(path.join(appDir, 'hello_world'))
    const fixtureRequirementsPath = path.join(codeRoot, 'requirements.txt')

    let tempFolder: string
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
    })

    function makeConfig(overrides: Partial<SamLaunchRequestArgs> = {}): SamLaunchRequestArgs {
        return {
            name: 'test-launch-config',
            type: AWS_SAM_DEBUG_TYPE,
            request: 'attach',
            runtime: 'python3.14' as Runtime,
            runtimeFamily: RuntimeFamily.Python,
            handlerName: 'app.lambda_handler',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot,
            baseBuildDir: tempFolder,
            documentUri: vscode.Uri.file(''),
            templatePath: path.join(tempFolder, 'app___vsctk___template.yaml'),
            debugPort: 5858,
            noDebug: false,
            invokeTarget: {
                target: CODE_TARGET_TYPE,
                lambdaHandler: 'app.lambda_handler',
                projectRoot: codeRoot,
            },
            ...overrides,
        } as SamLaunchRequestArgs
    }

    describe('fixture contents (sanity check of the invariants relied upon by makePythonDebugManifest)', function () {
        it('contains the original "requests" dependency and the new pinned "urllib3" dependency', async function () {
            const rawText = await fs.readFileText(fixtureRequirementsPath)
            const lines = rawText.split(/\r?\n/)

            assert.deepStrictEqual(lines, [
                'requests',
                'urllib3>=2.2.2 # not directly required, pinned by Snyk to avoid a vulnerability',
            ])
        })

        it('does not already contain "debugpy" (manifest generation relies on this to decide whether to append it)', async function () {
            const rawText = await fs.readFileText(fixtureRequirementsPath)
            assert.strictEqual(rawText.includes('debugpy'), false)
        })
    })

    describe('makePythonDebugConfig()', function () {
        it('generates a debug manifest that preserves both dependencies and appends debugpy', async function () {
            const originalFixtureText = await fs.readFileText(fixtureRequirementsPath)

            const config = makeConfig()
            const result = await makePythonDebugConfig(config)

            assert.ok(result.manifestPath, 'expected a manifestPath to be generated')
            const manifestText = await fs.readFileText(result.manifestPath!)

            // Original fixture contents are preserved verbatim.
            assert.ok(manifestText.includes('requests'), 'manifest should retain the "requests" dependency')
            assert.ok(
                manifestText.includes('urllib3>=2.2.2 # not directly required, pinned by Snyk to avoid a vulnerability'),
                'manifest should retain the pinned "urllib3" dependency and its comment'
            )
            // debugpy is appended for debugging support.
            assert.ok(manifestText.includes('debugpy>=1.0,<2'), 'manifest should have debugpy appended')

            // Verify exact structure: original fixture text, then EOL, then the debugpy line at the end.
            // (Compares against the fixture text read at runtime rather than a hardcoded literal, so the
            // assertion is not sensitive to the checked-out line-ending style of the fixture file.)
            const expected = `${originalFixtureText}${os.EOL}debugpy>=1.0,<2`
            assert.strictEqual(manifestText, expected)
        })

        it('writes the debug manifest to a separate file, leaving the original fixture untouched', async function () {
            const originalTextBefore = await fs.readFileText(fixtureRequirementsPath)

            const config = makeConfig()
            const result = await makePythonDebugConfig(config)

            assert.strictEqual(
                pathutil.normalize(result.manifestPath!),
                pathutil.normalize(path.join(tempFolder, 'debug-requirements.txt'))
            )

            // The original fixture file must remain unmodified by manifest generation.
            const originalTextAfter = await fs.readFileText(fixtureRequirementsPath)
            assert.strictEqual(originalTextAfter, originalTextBefore)
            assert.strictEqual(originalTextAfter.includes('debugpy'), false)
        })

        it('does not generate a manifest when noDebug is true (boundary case: requirements.txt is not read)', async function () {
            const config = makeConfig({ noDebug: true })
            const result = await makePythonDebugConfig(config)

            assert.strictEqual(result.manifestPath, undefined)
            assert.strictEqual(await fs.existsFile(path.join(tempFolder, 'debug-requirements.txt')), false)
        })
    })
})