// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.testFramework.runInEdtAndGet
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils.addSamTemplate
import software.aws.toolkits.jetbrains.services.lambda.verifyPathMappings
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import java.nio.file.Paths

class PythonLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val sut = PythonLambdaBuilder()

    @Test
    fun handlerBaseDirIsCorrect() {
        val handler = addPythonHandler("hello_world")
        addRequirementsFile()

        val baseDir = sut.handlerBaseDirectory(projectRule.module, handler)
        val root = Paths.get(projectRule.fixture.tempDirPath)
        assertThat(baseDir.toAbsolutePath()).isEqualTo(root)
    }

    @Test
    fun handlerBaseDirIsCorrectInSubDir() {
        val handler = addPythonHandler("hello-world/foo-bar")
        addRequirementsFile("hello-world")

        val baseDir = sut.handlerBaseDirectory(projectRule.module, handler)
        val root = Paths.get(projectRule.fixture.tempDirPath)
        assertThat(baseDir).isEqualTo(root.resolve("hello-world"))
    }

    @Test
    fun missingRequirementsThrowsForHandlerBaseDir() {
        val handler = addPythonHandler("hello-world/foo-bar")

        assertThatThrownBy {
            sut.handlerBaseDirectory(projectRule.module, handler)
        }.hasMessageStartingWith("Cannot locate requirements.txt")
    }

    @Test
    fun buildDirectoryIsCorrect() {
        val baseDir = sut.getBuildDirectory(projectRule.module)
        val root = ModuleRootManager.getInstance(projectRule.module).contentRoots.first().path
        assertThat(baseDir).isEqualTo(Paths.get(root, SamCommon.SAM_BUILD_DIR, "build"))
    }

    @Test
    fun defaultPathMappingsAreCorrect() {
        val handler = addPythonHandler("hello-world")
        addRequirementsFile("hello-world")

        val codeUri = sut.handlerBaseDirectory(projectRule.module, handler)
        val buildDir = sut.getBuildDirectory(projectRule.module)

        val logicalId = "SomeFunction"
        val template = projectRule.fixture.addSamTemplate(logicalId, codeUri.toString(), "hello_world/app.handle", LambdaRuntime.PYTHON3_8)
        val templatePath = Paths.get(template.virtualFile.path)

        val actualMappings = sut.defaultPathMappings(templatePath, logicalId, buildDir)
        verifyPathMappings(
            projectRule.module,
            actualMappings,
            listOf(
                PathMapping(codeUri.toString(), LambdaBuilder.TASK_PATH),
                PathMapping(buildDir.resolve(logicalId).toString(), LambdaBuilder.TASK_PATH)
            )
        )
    }

    private fun addPythonHandler(subPath: String): PyFunction {
        val psiFile = projectRule.fixture.addFileToProject(
            "$subPath/app.py",
            """
            def handle(event, context):
                return "HelloWorld"
            """.trimIndent()
        ) as PyFile

        return runInEdtAndGet {
            psiFile.findTopLevelFunction("handle")!!
        }
    }

    private fun addRequirementsFile(subPath: String = ".", content: String = "") {
        projectRule.fixture.addFileToProject("$subPath/requirements.txt", content)
    }
}
