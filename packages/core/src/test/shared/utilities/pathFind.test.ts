/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

import * as testutil from '../../testUtil'
import { findTypescriptCompiler, getVscodeCliPath } from '../../../shared/utilities/pathFind'

describe('pathFind', function () {
    it('findTypescriptCompiler()', async function () {
        const iswin = process.platform === 'win32'
        const workspace = vscode.workspace.workspaceFolders![0]
        const tscNodemodules = path.join(workspace.uri.fsPath, `foo/bar/node_modules/.bin/tsc${iswin ? '.cmd' : ''}`)
        fs.removeSync(tscNodemodules)

        // The test workspace normally doesn't have node_modules so this will
        // be undefined or it will find the globally-installed "tsc".
        const tscGlobal = await findTypescriptCompiler()
        assert.ok(tscGlobal === undefined || tscGlobal === 'tsc')

        // Create a fake "node_modules/.bin/tsc" in the test workspace.
        await testutil.createExecutableFile(tscNodemodules, 'echo "typescript Version 42"')

        const result = await findTypescriptCompiler()
        assert(result !== undefined)
        testutil.assertEqualPaths(result, tscNodemodules)
        fs.removeSync(tscNodemodules)
    })

    it('getVscodeCliPath()', async function () {
        if (os.platform() === 'linux') {
            this.skip()
        }
        const vscPath = await getVscodeCliPath()
        assert(vscPath)
        const regex = /bin[\\\/](code|code-insiders)$/
        assert.ok(regex.test(vscPath), `expected regex ${regex} to match: "${vscPath}"`)
    })
})
