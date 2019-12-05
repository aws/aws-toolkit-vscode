/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadAndUnzipVSCode } from 'vscode-test'

const ENVVAR_VSCODE_TEST_VERSION = 'VSCODE_TEST_VERSION'

/**
 * Downloads and unzips a copy of VS Code to run tests against.
 *
 * Test suites can set up an experimental instance of VS Code however they want.
 * This method provides the common use-case, pulling down the latest version (aka 'stable').
 * The VS Code version under test can be altered by setting the environment variable
 * VSCODE_TEST_VERSION prior to running the tests.
 */
export async function setupVSCodeTestInstance(): Promise<string> {
    const vsCodeVersion = process.env[ENVVAR_VSCODE_TEST_VERSION] || 'stable'

    console.log(`About to set up test instance of VS Code, version ${vsCodeVersion}...`)
    const vsCodeExecutablePath = await downloadAndUnzipVSCode(vsCodeVersion)
    console.log(`VS Code test instance location: ${vsCodeExecutablePath}`)

    return vsCodeExecutablePath
}
