/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import {
    DefaultCodeWhispererClient,
    codeScanPythonPayloadSizeLimitBytes,
    CodeAnalysisScope,
    codeScanFindingsSchema,
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
    ZipUtil,
} from 'aws-core-vscode/codewhisperer'
import { resetCodeWhispererGlobalVariables, toFile } from 'aws-core-vscode/test'
import * as path from 'path'
import { setValidConnection, skipTestIfNoValidConn } from '../util/connection'
import { getTestWorkspaceFolder } from 'aws-core-vscode/testInteg'
import { closeAllEditors } from 'aws-core-vscode/test'
import { makeTemporaryToolkitFolder } from 'aws-core-vscode/shared'
import { fsCommon } from 'aws-core-vscode/srcShared'
import { randomUUID } from 'aws-core-vscode/common'

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

const largePrompt = 'a'.repeat(codeScanPythonPayloadSizeLimitBytes + 1)

const javaPromptNoBuild = `class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World!");
    }
}`

describe('CodeWhisperer security scan', async function () {
    let validConnection: boolean
    let tempFolder: string
    const client = new DefaultCodeWhispererClient()
    const workspaceFolder = getTestWorkspaceFolder()

    before(async function () {
        validConnection = await setValidConnection()
    })

    beforeEach(function () {
        void resetCodeWhispererGlobalVariables()
        //valid connection required to run tests
        skipTestIfNoValidConn(validConnection, this)
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

    returns artifactMap, projectPath and codeScanName
    */
    async function securityJobSetup(editor: vscode.TextEditor) {
        const codeScanStartTime = performance.now()
        const zipUtil = new ZipUtil()
        const uri = editor.document.uri

        const projectPaths = zipUtil.getProjectPaths()
        const scope = CodeAnalysisScope.PROJECT
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
        //set up file and editor
        const appRoot = path.join(workspaceFolder, 'python3.7-plain-sam-app')
        const appCodePath = path.join(appRoot, 'hello_world', 'app.py')
        const editor = await openTestFile(appCodePath)

        //run security scan
        const securityJobSetupResult = await securityJobSetup(editor)
        const artifactMap = securityJobSetupResult.artifactMap
        const projectPaths = securityJobSetupResult.projectPaths

        const scope = CodeAnalysisScope.PROJECT

        //get job status and result
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
            codeScanFindingsSchema,
            projectPaths,
            scope
        )

        assert.deepStrictEqual(jobStatus, 'Completed')
        assert.ok(securityRecommendationCollection.length === 0)
    })

    it('codescan request with valid input params and security issues completes scan and returns recommendations', async function () {
        //set up file and editor
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test.py')
        await toFile(filePromptWithSecurityIssues, tempFile)
        const editor = await openTestFile(tempFile)

        const scope = CodeAnalysisScope.PROJECT

        //run security scan
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

        //get job status and result
        const jobStatus = await pollScanJobStatus(
            client,
            scanJob.jobId,
            scope,
            securityJobSetupResult.codeScanStartTime
        )
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            codeScanFindingsSchema,
            projectPaths,
            scope
        )

        assert.deepStrictEqual(jobStatus, 'Completed')
        assert.ok(securityRecommendationCollection.length === 1)
    })

    it('codescan request on file that is too large causes scan job setup to fail', async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test2.py')
        await toFile(largePrompt, tempFile)
        const editor = await openTestFile(tempFile)

        await assert.rejects(() => securityJobSetup(editor))
    })

    it('codescan request on java file with no build causes scan job setup to fail', async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        const tempFile = path.join(tempFolder, 'test.java')
        await toFile(javaPromptNoBuild, tempFile)
        const editor = await openTestFile(tempFile)

        await assert.rejects(() => securityJobSetup(editor))
    })
})
