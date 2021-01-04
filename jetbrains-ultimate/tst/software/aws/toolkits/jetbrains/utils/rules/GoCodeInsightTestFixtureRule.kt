// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.goide.GoConstants
import com.goide.psi.GoFile
import com.goide.sdk.GoSdkType
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.impl.ProjectJdkImpl
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.testFramework.LightProjectDescriptor
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndGet

class GoCodeInsightTestFixtureRule : CodeInsightTestFixtureRule(GoLightProjectDescriptor()) {
    override fun createTestFixture(): CodeInsightTestFixture {
        val codeInsightFixture = super.createTestFixture()

        PsiTestUtil.addContentRoot(codeInsightFixture.module, codeInsightFixture.tempDirFixture.getFile(".")!!)

        return codeInsightFixture
    }
}

class GoLightProjectDescriptor : LightProjectDescriptor() {
    override fun getSdk(): Sdk? = null
    override fun getModuleTypeId(): String = GoConstants.MODULE_TYPE_ID
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

fun createMockSdk(version: String): Sdk {
    val sdk = ProjectJdkImpl("Go $version", GoSdkType())
    sdk.versionString = version
    GoSdkType().setupSdkPaths(sdk)
    return sdk
}
