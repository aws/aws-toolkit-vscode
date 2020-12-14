// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.application.invokeAndWaitIfNeeded
import com.intellij.openapi.module.ModuleType
import com.intellij.testFramework.PsiTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambdaFromTemplate
import software.aws.toolkits.jetbrains.utils.rules.HeavyNodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import software.aws.toolkits.jetbrains.utils.rules.addSamTemplate
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.nio.file.Paths

class NodeJsLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = HeavyNodeJsCodeInsightTestFixtureRule()

    private val sut = NodeJsLambdaBuilder()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()
        PsiTestUtil.addModule(projectRule.project, ModuleType.EMPTY, "main", projectRule.fixture.tempDirFixture.findOrCreateDir("main"))
    }

    @Test
    fun contentRootIsAdded() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"

        val module = projectRule.module
        val handler = projectRule.fixture.addLambdaHandler(subPath, fileName, handlerName)
        projectRule.fixture.addPackageJsonFile()
        val builtLambda = sut.buildLambda(module, handler, Runtime.NODEJS12_X, "$subPath/$fileName.$handlerName")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "$subPath/$fileName.js",
            "package.json"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%" to "/var/task/",
            "%BUILD_ROOT%" to "/var/task/"
        )
    }

    @Test
    fun sourceRootTakesPrecedenceOverContentRoot() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"

        val module = projectRule.module
        val handler = projectRule.fixture.addLambdaHandler(subPath, fileName, handlerName)
        projectRule.fixture.addPackageJsonFile(subPath)

        invokeAndWaitIfNeeded {
            PsiTestUtil.addSourceRoot(module, handler.containingFile.virtualFile.parent)
        }

        val builtLambda = sut.buildLambda(module, handler, Runtime.NODEJS12_X, "$fileName.$handlerName")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "$fileName.js",
            "package.json"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%/$subPath" to "/var/task/",
            "%BUILD_ROOT%" to "/var/task/"
        )
    }

    @Test
    fun builtFromTemplate() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"
        val logicalName = "SomeFunction"

        projectRule.fixture.addLambdaHandler(subPath, fileName, handlerName)
        projectRule.fixture.addPackageJsonFile(subPath)

        val templateFile = projectRule.fixture.addSamTemplate(
            logicalName = logicalName,
            codeUri = subPath,
            handler = "$fileName.$handlerName",
            runtime = Runtime.NODEJS12_X
        )
        val templatePath = Paths.get(templateFile.virtualFile.path)

        val builtLambda = sut.buildLambdaFromTemplate(projectRule.module, templatePath, logicalName)

        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "$fileName.js",
            "package.json"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            projectRule.module,
            builtLambda,
            "%PROJECT_ROOT%/$subPath" to "/var/task/",
            "%BUILD_ROOT%" to "/var/task/"
        )
    }

    @Test
    fun dependenciesAreAdded() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"

        val module = projectRule.module
        val handler = projectRule.fixture.addLambdaHandler(subPath, fileName, handlerName)
        projectRule.fixture.addPackageJsonFile(
            content =
                """
            {
                "name": "hello-world",
                "version": "1.0.0",
                "dependencies": {
                    "axios": "^0.18.0"
                }
            }
                """.trimIndent()
        )
        val builtLambda = sut.buildLambda(module, handler, Runtime.NODEJS12_X, "$subPath/$fileName.$handlerName")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "$subPath/$fileName.js",
            "node_modules/axios/package.json",
            "package.json"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%" to "/var/task/",
            "%BUILD_ROOT%" to "/var/task"
        )
    }

    @Test
    fun buildInContainer() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"

        val handler = projectRule.fixture.addLambdaHandler(subPath)
        projectRule.fixture.addPackageJsonFile()

        val builtLambda = sut.buildLambda(projectRule.module, handler, Runtime.NODEJS12_X, "$subPath/$fileName.$handlerName", true)
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "$subPath/$fileName.js",
            "package.json"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            projectRule.module,
            builtLambda,
            "%PROJECT_ROOT%" to "/var/task/",
            "%BUILD_ROOT%" to "/var/task/"
        )
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
}
