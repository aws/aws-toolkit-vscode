// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.testFramework.PsiTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils.addSamTemplate
import software.aws.toolkits.jetbrains.services.lambda.verifyPathMappings
import software.aws.toolkits.jetbrains.utils.rules.HeavyNodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import java.nio.file.Paths

class NodeJsLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = HeavyNodeJsCodeInsightTestFixtureRule()

    private val sut = NodeJsLambdaBuilder()

    @Before
    fun setUp() {
        PsiTestUtil.addModule(projectRule.project, ModuleType.EMPTY, "main", projectRule.fixture.tempDirFixture.findOrCreateDir("main"))
    }

    @Test
    fun handlerBaseDirIsCorrect() {
        val handlerFile = projectRule.fixture.addLambdaHandler(subPath = "hello-world")
        projectRule.fixture.addPackageJsonFile("hello-world")

        val baseDir = sut.handlerBaseDirectory(projectRule.module, handlerFile)
        val root = Paths.get(projectRule.fixture.tempDirPath)
        assertThat(baseDir.toAbsolutePath()).isEqualTo(root.resolve("hello-world"))
    }

    @Test
    fun handlerBaseDirIsCorrectInSubDir() {
        val handlerFile = projectRule.fixture.addLambdaHandler(subPath = "hello-world/foo-bar")
        projectRule.fixture.addPackageJsonFile("hello-world")

        val baseDir = sut.handlerBaseDirectory(projectRule.module, handlerFile)
        val root = Paths.get(projectRule.fixture.tempDirPath)
        assertThat(baseDir).isEqualTo(root.resolve("hello-world"))
    }

    @Test
    fun missingPackageJsonThrowsForHandlerBaseDir() {
        val handlerFile = projectRule.fixture.addLambdaHandler(subPath = "hello-world/foo-bar")

        assertThatThrownBy {
            sut.handlerBaseDirectory(projectRule.module, handlerFile)
        }.hasMessageStartingWith("Cannot locate package.json")
    }

    @Test
    fun buildDirectoryIsCorrect() {
        val baseDir = sut.getBuildDirectory(projectRule.module)
        val root = ModuleRootManager.getInstance(projectRule.module).contentRoots.first().path
        assertThat(baseDir).isEqualTo(Paths.get(root, SamCommon.SAM_BUILD_DIR, "build"))
    }

    @Test
    fun defaultPathMappingsAreCorrect() {
        val handlerFile = projectRule.fixture.addLambdaHandler()
        projectRule.fixture.addPackageJsonFile()
        val codeUri = sut.handlerBaseDirectory(projectRule.module, handlerFile)
        val buildDir = sut.getBuildDirectory(projectRule.module)

        val logicalId = "SomeFunction"
        val template = projectRule.fixture.addSamTemplate(logicalId, codeUri.toString(), "app.handle", LambdaRuntime.NODEJS20_X)
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
}
