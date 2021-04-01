// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.goide.GoConstants
import com.goide.project.GoModuleSettings
import com.goide.psi.GoFile
import com.goide.sdk.GoSdk
import com.goide.sdk.GoSdkImpl
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.testFramework.LightProjectDescriptor
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.xdebugger.XDebuggerUtil

class GoCodeInsightTestFixtureRule : CodeInsightTestFixtureRule(GoLightProjectDescriptor()) {
    override fun createTestFixture(): CodeInsightTestFixture {
        val codeInsightFixture = super.createTestFixture()
        PsiTestUtil.addContentRoot(codeInsightFixture.module, codeInsightFixture.tempDirFixture.getFile(".")!!)
        GoModuleSettings.getInstance(codeInsightFixture.module).isGoSupportEnabled = true
        return codeInsightFixture
    }
}

class GoLightProjectDescriptor : LightProjectDescriptor() {
    override fun getSdk(): Sdk? = null
    override fun getModuleTypeId(): String = GoConstants.MODULE_TYPE_ID
}

class HeavyGoCodeInsightTestFixtureRule : CodeInsightTestFixtureRule() {
    override fun createTestFixture(): CodeInsightTestFixture {
        val fixtureFactory = IdeaTestFixtureFactory.getFixtureFactory()
        val projectFixture = fixtureFactory.createFixtureBuilder(testName)
        val codeInsightFixture = fixtureFactory.createCodeInsightFixture(projectFixture.fixture)
        codeInsightFixture.setUp()
        codeInsightFixture.testDataPath = testDataPath

        return codeInsightFixture
    }

    fun addBreakpoint() {
        runInEdtAndWait {
            val document = fixture.editor.document
            val psiFile = fixture.file as GoFile
            val lineNumber = document.getLineNumber(psiFile.functions.first().textOffset)

            XDebuggerUtil.getInstance().toggleLineBreakpoint(
                project,
                fixture.file.virtualFile,
                lineNumber
            )
        }
    }
}

fun CodeInsightTestFixture.addGoLambdaHandler(
    subPath: String = ".",
    fileName: String = "app",
    handlerName: String = "handler",
    fileContent: String = """
    package main
        
    func handler() { 
    }
    """.trimIndent()
): PsiElement {
    val psiFile = this.addFileToProject("$subPath/$fileName.go", fileContent) as GoFile

    return runInEdtAndGet {
        psiFile.findElementAt(fileContent.indexOf(handlerName))!!
    }
}

fun CodeInsightTestFixture.addGoModFile(
    subPath: String = ".",
    content: String =
        """
        require github.com/aws/aws-lambda-go v1.13.3

        module hello-world

        go 1.14
        """.trimIndent()
): PsiFile = this.addFileToProject("$subPath/go.mod", content)

fun createMockSdk(root: String, version: String): GoSdk = GoSdkImpl(root, version, null)
