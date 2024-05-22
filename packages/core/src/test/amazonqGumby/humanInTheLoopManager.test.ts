/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import path from 'path'
import { HumanInTheLoopManager } from '../../codewhisperer/service/transformByQ/humanInTheLoopManager'
import { getTestResourceFilePath, stripStringWhitespace } from './amazonQGumbyUtil'
import { fsCommon } from '../../srcShared/fs'
import { assertEqualPaths } from '../testUtil'

describe('HumanInTheLoopManager', async function () {
    it('will getUserDependencyUpdateDir()', async function () {
        const updateDirPath = HumanInTheLoopManager.instance.getUserDependencyUpdateDir()
        assert.ok(updateDirPath, 'q-pom-dependency-update')
    })
    it('will getUploadFolderInfo()', async function () {
        const uploadFolderInfo = HumanInTheLoopManager.instance.getUploadFolderInfo()
        assert.strictEqual(uploadFolderInfo.name, 'q-pom-dependency-update')
        assert.strictEqual(uploadFolderInfo.path, HumanInTheLoopManager.instance.getUserDependencyUpdateDir())
    })
    it('will getCompileDependencyListFolderInfo()', async function () {
        const compileFolderInfo = HumanInTheLoopManager.instance.getCompileDependencyListFolderInfo()
        assert.strictEqual(compileFolderInfo.name, 'q-pom-dependency-list')
        assert.strictEqual(compileFolderInfo.path, HumanInTheLoopManager.instance.getTmpDependencyListDir())
    })
    it('will createPomFileCopy() and delete artifact', async function () {
        const pomFileVirtualFileReference = vscode.Uri.file(
            getTestResourceFilePath('resources/files/humanInTheLoop/downloadResults/pom.xml')
        )
        const outputDirectoryPath = path.resolve(__dirname, 'testOutput')
        const newPomFilePath = await HumanInTheLoopManager.instance.createPomFileCopy(
            outputDirectoryPath,
            pomFileVirtualFileReference
        )
        const outputPathResult = path.join(outputDirectoryPath, 'pom.xml')
        assertEqualPaths(newPomFilePath.path.toLowerCase(), outputPathResult.toLowerCase())
        const newPomFileContents = await fsCommon.readFileAsString(newPomFilePath.path)
        assert.strictEqual(
            stripStringWhitespace(newPomFileContents),
            stripStringWhitespace(`<?xml version="1.0" encoding="UTF-8"?>
            <project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                    xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
            <modelVersion>4.0.0</modelVersion>
            <groupId>GROUP_ID</groupId>
            <artifactId>ARTIFACT_ID</artifactId>
            <version>VERSION</version>
            
            <dependencies>
                <dependency>
                <groupId>org.projectlombok</groupId>
                <artifactId>lombok</artifactId>
                <version>*****</version>
                </dependency>
            </dependencies>
            </project>
            `)
        )
        await HumanInTheLoopManager.instance.cleanUpArtifacts()
        const newPomFileDoesNotExistFlag = await fsCommon.existsFile(newPomFilePath)
        assert.equal(newPomFileDoesNotExistFlag, false)
    })
})
