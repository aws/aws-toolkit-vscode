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
import { setValidConnection, skipTestIfNoValidConn } from '../util/connection'
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
import fs from '../../shared/fs/fs'
import { ZipUtil } from '../../codewhisperer/util/zipUtil'
import { randomUUID } from '../../shared/crypto'

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
        // valid connection required to run tests
        skipTestIfNoValidConn(validConnection, this)
    })

    afterEach(async function () {
        if (tempFolder !== undefined) {
            await fs.delete(tempFolder, { recursive: true })
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

    returns artifactMap, projectPath and codeScanName
    */
    async function securityJobSetup(editor: vscode.TextEditor) {
        const codeScanStartTime = performance.now()
        const zipUtil = new ZipUtil()
        const uri = editor.document.uri

        const projectPaths = zipUtil.getProjectPaths()
        const scope = CodeWhispererConstants.CodeAnalysisScope.PROJECT
        const zipMetadata = await zipUtil.generateZip(uri, scope)
        const codeScanName = randomUUID()

        let artifactMap
        try {
            artifactMap = await getPresignedUrlAndUpload(client, zipMetadata, scope, codeScanName)
        } finally {
            await zipUtil.removeTmpFiles(zipMetadata, scope)
        }
        return {
            artifactMap: artifactMap,
            projectPaths: projectPaths,
            codeScanName: codeScanName,
            codeScanStartTime: codeScanStartTime,
        }
    }

    it('codescan request with valid input params and no security issues completes scan and returns no recommendations', async function () {
        // set up file and editor
        const appRoot = path.join(workspaceFolder, 'python3.7-plain-sam-app')
        const appCodePath = path.join(appRoot, 'hello_world', 'app.py')
        const editor = await openTestFile(appCodePath)

        // run security scan
        const securityJobSetupResult = await securityJobSetup(editor)
        const artifactMap = securityJobSetupResult.artifactMap
        const projectPaths = securityJobSetupResult.projectPaths

        const scope = CodeWhispererConstants.CodeAnalysisScope.PROJECT

        // get job status and result
        const scanJob = await createScanJob(
            client,
            artifactMap,
            editor.document.languageId,
            scope,
            securityJobSetupResult.codeScanName
        )
        const jobStatus = await pollScanJobStatus(
            client,
            scanJob.jobId,
            scope,
            securityJobSetupResult.codeScanStartTime
        )
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPaths,
            scope,
            editor
        )

        assert.deepStrictEqual(jobStatus, 'Completed')
        assert.ok(securityRecommendationCollection.length === 0)
    })

    it('codescan request with valid input params and security issues completes scan and returns recommendations', async function () {
        // set up file and editor
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test.py')
        await testutil.toFile(filePromptWithSecurityIssues, tempFile)
        const editor = await openTestFile(tempFile)

        const scope = CodeWhispererConstants.CodeAnalysisScope.PROJECT

        // run security scan
        const securityJobSetupResult = await securityJobSetup(editor)
        const artifactMap = securityJobSetupResult.artifactMap
        const projectPaths = securityJobSetupResult.projectPaths
        const scanJob = await createScanJob(
            client,
            artifactMap,
            editor.document.languageId,
            scope,
            securityJobSetupResult.codeScanName
        )

        // get job status and result
        const jobStatus = await pollScanJobStatus(
            client,
            scanJob.jobId,
            scope,
            securityJobSetupResult.codeScanStartTime
        )
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPaths,
            scope,
            editor
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
