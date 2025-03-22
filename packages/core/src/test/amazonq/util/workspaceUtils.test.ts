/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import path from 'path'
import { getWorkspaceForFile, getWorkspacePaths } from '../../../shared/utilities/workspaceUtils'
import { getTestWorkspaceFolder } from '../../../testInteg/integrationTestsUtilities'

describe('getProjectPaths', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = path.join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = path.join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')

    it('Should return the correct project paths', function () {
        assert.deepStrictEqual(getWorkspacePaths(), [workspaceFolder])
    })

    it('Should return the correct project path for unit test generation', function () {
        assert.deepStrictEqual(getWorkspaceForFile(appCodePath), workspaceFolder)
    })
})
