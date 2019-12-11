// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterManager
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterRef
import com.intellij.javascript.nodejs.interpreter.local.NodeJsLocalInterpreter
import com.intellij.javascript.nodejs.interpreter.local.NodeJsLocalInterpreterManager
import com.intellij.lang.javascript.dialects.JSLanguageLevel
import com.intellij.lang.javascript.psi.JSFile
import com.intellij.lang.javascript.settings.JSRootConfiguration
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.util.Ref
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.testFramework.LightProjectDescriptor
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.text.SemVer
import com.intellij.xdebugger.XDebuggerUtil
import software.amazon.awssdk.services.lambda.model.Runtime
import java.io.File

/**
 * JUnit test Rule that will create a Light [Project] and [CodeInsightTestFixture] with NodeJs support. Projects are
 * lazily created and are torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
class NodeJsCodeInsightTestFixtureRule : CodeInsightTestFixtureRule() {
    override fun createTestFixture(): CodeInsightTestFixture {
        val fixtureFactory = IdeaTestFixtureFactory.getFixtureFactory()
        val projectFixture = fixtureFactory.createLightFixtureBuilder(NodeJsLightProjectDescriptor())
        val codeInsightFixture = fixtureFactory.createCodeInsightFixture(projectFixture.fixture)
        codeInsightFixture.setUp()
        codeInsightFixture.testDataPath = testDataPath
        PsiTestUtil.addContentRoot(codeInsightFixture.module, codeInsightFixture.tempDirFixture.getFile(".")!!)
        codeInsightFixture.project.setNodeJsInterpreterVersion(SemVer("v8.10.10", 8, 10, 10))
        codeInsightFixture.project.setJsLanguageLevel(JSLanguageLevel.ES6)

        return codeInsightFixture
    }

    fun addBreakpoint() {
        runInEdtAndWait {
            val document = fixture.editor.document
            val psiFile = fixture.file as JSFile
            val lineNumber = document.getLineNumber(psiFile.statements.first().textOffset)

            XDebuggerUtil.getInstance().toggleLineBreakpoint(
                project,
                fixture.file.virtualFile,
                lineNumber
            )
        }
    }
}

class NodeJsLightProjectDescriptor : LightProjectDescriptor() {
    override fun getSdk(): Sdk? = null

    override fun createModule(project: Project, moduleFilePath: String): Module? = WriteAction.compute<Module?, Throwable> {
        val imlFile = File(moduleFilePath)
        if (imlFile.exists()) {
            FileUtil.delete(imlFile)
        }
        ModuleManager.getInstance(project).newModule(moduleFilePath, WebModuleTypeBase.getInstance().id)
    }
}

class MockNodeJsInterpreter(private var version: SemVer) : NodeJsLocalInterpreter("/path/to/$version/mock/node") {
    init {
        NodeJsLocalInterpreterManager.getInstance().interpreters =
            NodeJsLocalInterpreterManager.getInstance().interpreters + listOf(this)
    }

    override fun getCachedVersion(): Ref<SemVer>? = Ref(version)
}

class HeavyNodeJsCodeInsightTestFixtureRule : CodeInsightTestFixtureRule() {
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
            val psiFile = fixture.file as JSFile
            val lineNumber = document.getLineNumber(psiFile.statements.first().textOffset)

            XDebuggerUtil.getInstance().toggleLineBreakpoint(
                project,
                fixture.file.virtualFile,
                lineNumber
            )
        }
    }
}

fun Project.setNodeJsInterpreterVersion(version: SemVer) {
    NodeJsInterpreterManager.getInstance(this).setInterpreterRef(
        NodeJsInterpreterRef.create(MockNodeJsInterpreter(version))
    )
}

fun Project.setJsLanguageLevel(languageLevel: JSLanguageLevel) {
    JSRootConfiguration.getInstance(this)
        .storeLanguageLevelAndUpdateCaches(languageLevel)
}

fun CodeInsightTestFixture.addLambdaHandler(
    subPath: String = ".",
    fileName: String = "app",
    handlerName: String = "lambdaHandler",
    fileContent: String = """
        exports.$handlerName = function (event, context, callback) {
            return 'HelloWorld'
        };
        """.trimIndent()
): PsiElement {
    val psiFile = this.addFileToProject("$subPath/$fileName.js", fileContent) as JSFile

    return runInEdtAndGet {
        psiFile.findElementAt(fileContent.indexOf(handlerName))!!
    }
}

fun CodeInsightTestFixture.addPackageJsonFile(
    subPath: String = ".",
    content: String = """
        {
            "name": "hello-world",
            "version": "1.0.0"
        }
    """.trimIndent()
): PsiFile = this.addFileToProject("$subPath/package.json", content)

fun CodeInsightTestFixture.addSamTemplate(
    logicalName: String = "Function",
    codeUri: String,
    handler: String,
    runtime: Runtime
): PsiFile = this.addFileToProject(
    "template.yaml",
    """
        Resources:
          $logicalName:
            Type: AWS::Serverless::Function
            Properties:
              CodeUri: $codeUri
              Handler: $handler
              Runtime: $runtime
              Timeout: 900
        """.trimIndent()
)
