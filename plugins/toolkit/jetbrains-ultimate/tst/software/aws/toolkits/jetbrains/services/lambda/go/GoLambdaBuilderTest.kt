// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.testFramework.PsiTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.utils.rules.HeavyGoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addGoLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addGoModFile
import java.nio.file.Paths

class GoLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = HeavyGoCodeInsightTestFixtureRule()

    private val sut = GoLambdaBuilder()

    @Before
    fun setUp() {
        // This sets the root as /main. We want a source root so we don't look outside of our project for a go.mod file
        PsiTestUtil.addModule(projectRule.project, ModuleType.EMPTY, "main", projectRule.fixture.tempDirFixture.findOrCreateDir("main"))
    }

    @Test
    fun handlerBaseDirIsCorrect() {
        val handler = projectRule.fixture.addGoLambdaHandler(subPath = "main/helloworld")
        projectRule.fixture.addGoModFile("main/helloworld")

        val baseDir = sut.handlerBaseDirectory(projectRule.module, handler)
        val root = Paths.get(projectRule.fixture.tempDirPath)
        assertThat(baseDir.toAbsolutePath()).isEqualTo(root.resolve("main/helloworld"))
    }

    @Test
    fun handlerBaseDirIsCorrectInSubDir() {
        val handler = projectRule.fixture.addGoLambdaHandler(subPath = "main/helloworld/foobar")
        projectRule.fixture.addGoModFile("main/helloworld")

        val baseDir = sut.handlerBaseDirectory(projectRule.module, handler)
        val root = Paths.get(projectRule.fixture.tempDirPath)
        assertThat(baseDir).isEqualTo(root.resolve("main/helloworld"))
    }

    @Test
    fun missingGoModThrowsForHandlerBaseDir() {
        val handlerFile = projectRule.fixture.addGoLambdaHandler(subPath = "main/helloworld/foobar")

        assertThatThrownBy {
            sut.handlerBaseDirectory(projectRule.module, handlerFile)
        }.hasMessageStartingWith("Cannot locate go.mod")
    }

    @Test
    fun buildDirectoryIsCorrect() {
        val baseDir = sut.getBuildDirectory(projectRule.module)
        val root = ModuleRootManager.getInstance(projectRule.module).contentRoots.first().path
        assertThat(baseDir).isEqualTo(Paths.get(root, SamCommon.SAM_BUILD_DIR, "build"))
    }
}
