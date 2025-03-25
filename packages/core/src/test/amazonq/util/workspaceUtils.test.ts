/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import path from 'path'
import { getWorkspaceForFile, getWorkspacePaths } from '../../../shared/utilities/workspaceUtils'
import { getTestWorkspaceFolder } from '../../../testInteg/integrationTestsUtilities'

describe('getWorkspace utilities', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = path.join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = path.join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')

    it('returns the correct workspace paths', function () {
        assert.deepStrictEqual(getWorkspacePaths(), [workspaceFolder])
    })

    it('returns the correct worspace for a filepath', function () {
        assert.deepStrictEqual(getWorkspaceForFile(appCodePath), workspaceFolder)
    })
})
