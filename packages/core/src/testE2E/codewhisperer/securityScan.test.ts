/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as codewhispererClient from '../../codewhisperer/client/codewhisperer'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import * as path from 'path'
import * as testutil from '../../test/testUtil'
import { setValidConnection, skiptTestIfNoValidConn } from '../util/codewhispererUtil'
import { resetCodeWhispererGlobalVariables } from '../../test/codewhisperer/testUtil'
import { getTestWorkspaceFolder } from '../../testInteg/integrationTestsUtilities'
import { closeAllEditors } from '../../test/testUtil'
import {
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
} from '../../codewhisperer/service/securityScanHandler'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { fsCommon } from '../../srcShared/fs'
import { ZipUtil } from '../../codewhisperer/util/zipUtil'

const filePromptWithSecurityIssues = `from flask import app

def execute_input_noncompliant():
    from flask import request
    module_version = request.args.get("module_version")
    # Noncompliant: executes unsanitized inputs.
    exec("import urllib%s as urllib" % module_version)
        
def execute_input_compliant():
    from flask import request
    module_version = request.args.get("module_version")
    # Compliant: executes sanitized inputs.
    exec("import urllib%d as urllib" % int(module_version))`

const largePrompt = 'a'.repeat(CodeWhispererConstants.codeScanPythonPayloadSizeLimitBytes + 1)

const javaPromptNoBuild = `class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World!"); 
    }
}`

describe('CodeWhisperer security scan', async function () {
    let validConnection: boolean
    let tempFolder: string
    const client = new codewhispererClient.DefaultCodeWhispererClient()
    const workspaceFolder = getTestWorkspaceFolder()

    before(async function () {
        validConnection = await setValidConnection()
    })

    beforeEach(function () {
        void resetCodeWhispererGlobalVariables()
        //valid connection required to run tests
        skiptTestIfNoValidConn(validConnection, this)
    })

    afterEach(async function () {
        if (tempFolder !== undefined) {
            await fsCommon.delete(tempFolder)
        }
    })

    after(async function () {
        await closeAllEditors()
    })

    const openTestFile = async (filePath: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath)
        return await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
        })
    }

    /*
    securityJobSetup: combines steps 1 and 2 in startSecurityScan:
    
        Step 1: Generate context truncations
        Step 2: Get presigned Url and upload

    returns artifactMap and projectPath
    */
    async function securityJobSetup(editor: vscode.TextEditor) {
        const zipUtil = new ZipUtil()
        const uri = editor.document.uri

        const projectPath = zipUtil.getProjectPath(editor.document.uri)
        const zipMetadata = await zipUtil.generateZip(uri, CodeWhispererConstants.SecurityScanType.Project)

        let artifactMap
        try {
            artifactMap = await getPresignedUrlAndUpload(client, zipMetadata)
        } finally {
            await zipUtil.removeTmpFiles(zipMetadata)
        }
        return {
            artifactMap: artifactMap,
            projectPath: projectPath,
        }
    }

    it('codescan request with valid input params and no security issues completes scan and returns no recommendations', async function () {
        //set up file and editor
        const appRoot = path.join(workspaceFolder, 'python3.7-plain-sam-app')
        const appCodePath = path.join(appRoot, 'hello_world', 'app.py')
        const editor = await openTestFile(appCodePath)

        //run security scan
        const securityJobSetupResult = await securityJobSetup(editor)
        const artifactMap = securityJobSetupResult.artifactMap
        const projectPath = securityJobSetupResult.projectPath

        //get job status and result
        const scanJob = await createScanJob(client, artifactMap, editor.document.languageId)
        const jobStatus = await pollScanJobStatus(
            client,
            scanJob.jobId,
            CodeWhispererConstants.SecurityScanType.Project
        )
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPath
        )

        assert.deepStrictEqual(jobStatus, 'Completed')
        assert.ok(securityRecommendationCollection.length === 0)
    })

    it('codescan request with valid input params and security issues completes scan and returns recommendations', async function () {
        //set up file and editor
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test.py')
        await testutil.toFile(filePromptWithSecurityIssues, tempFile)
        const editor = await openTestFile(tempFile)

        //run security scan
        const securityJobSetupResult = await securityJobSetup(editor)
        const artifactMap = securityJobSetupResult.artifactMap
        const projectPath = securityJobSetupResult.projectPath
        const scanJob = await createScanJob(client, artifactMap, editor.document.languageId)

        //get job status and result
        const jobStatus = await pollScanJobStatus(
            client,
            scanJob.jobId,
            CodeWhispererConstants.SecurityScanType.Project
        )
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPath
        )

        assert.deepStrictEqual(jobStatus, 'Completed')
        assert.ok(securityRecommendationCollection.length === 1)
    })

    it('codescan request on file that is too large causes scan job setup to fail', async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test2.py')
        await testutil.toFile(largePrompt, tempFile)
        const editor = await openTestFile(tempFile)

        await assert.rejects(() => securityJobSetup(editor))
    })

    it('codescan request on java file with no build causes scan job setup to fail', async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test.java')
        await testutil.toFile(javaPromptNoBuild, tempFile)
        const editor = await openTestFile(tempFile)

        await assert.rejects(() => securityJobSetup(editor))
    })
})
