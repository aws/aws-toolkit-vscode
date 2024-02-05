// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.goide.GoConstants
import com.goide.project.GoModuleSettings
import com.goide.psi.GoFile
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
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
        ApplicationManager.getApplication().invokeAndWait {
            GoModuleSettings.getInstance(codeInsightFixture.module).isGoSupportEnabled = true
        }
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
        """.trimIndent()
): PsiFile = this.addFileToProject("$subPath/go.mod", content)

fun runGoModTidy(goModFile: VirtualFile) {
    val output = ExecUtil.execAndGetOutput(GeneralCommandLine("go").withParameters("mod", "tidy").withWorkDirectory(goModFile.parent.path))
    if (output.exitCode != 0) {
        throw IllegalStateException("'go mod tidy' did not return 0: ${output.stderr}")
    }
}

@Suppress("FunctionOnlyReturningConstant")
fun compatibleGoForIde() = "1.19.12"

fun CodeInsightTestFixture.ensureCorrectGoVersion(disposable: Disposable) {
    val versionCmd = GeneralCommandLine("goenv").withParameters("version")
    val output = ExecUtil.execAndGetOutput(versionCmd)
    if (output.exitCode != 0) {
        println("WARNING: goenv not found, can't switch Go SDK!!!!")
        return
    } else {
        println("Current Go version: ${output.stdout}")
    }

    val goVersionOverride = compatibleGoForIde()
    goVersionOverride.let {
        val overrideLocation = this.tempDirPath

        installGoSdk(overrideLocation, it)
        switchGoSdk(overrideLocation, it)

        Disposer.register(disposable) {
            removeGoOverride(overrideLocation)
        }
    }
}

private fun installGoSdk(overrideLocation: String, version: String) {
    println("Installing Go version $version")
    GeneralCommandLine("goenv").withParameters("install", version, "--skip-existing").withWorkDirectory(overrideLocation).runAndValidateCommand()
}

private fun switchGoSdk(overrideLocation: String, version: String) {
    println("Switching to Go version $version")
    GeneralCommandLine("goenv").withParameters("local", version).withWorkDirectory(overrideLocation).runAndValidateCommand()
}

private fun removeGoOverride(overrideLocation: String) {
    println("Removing Go override")
    GeneralCommandLine("goenv").withParameters("local", "--unset").withWorkDirectory(overrideLocation).runAndValidateCommand()
}

private fun GeneralCommandLine.runAndValidateCommand() {
    val output = ExecUtil.execAndGetOutput(this)
    check(output.exitCode == 0) { "${this.commandLineString} failed!\n ${output.stderr}" }
}
