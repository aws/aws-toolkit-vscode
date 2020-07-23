// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.application.invokeAndWaitIfNeeded
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.packageLambda
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import software.aws.toolkits.jetbrains.utils.rules.addSamTemplate
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.nio.file.Paths

class NodeJsLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    private val sut = NodeJsLambdaBuilder()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()
    }

    @Test
    fun findHandlerElementsIgnoresSamBuildLocation() {
        val sampleHandler = """
            exports.myLambdaHandler = async (event, context) => {}
            """.trimIndent()

        // Set up the actual project contents
        val expectedHandlerFile = projectRule.fixture.addFileToProject("hello-world/app.js", sampleHandler)
        projectRule.fixture.addPackageJsonFile("hello-world")

        // Populate some SAM Build contents
        projectRule.fixture.addFileToProject("${SamCommon.SAM_BUILD_DIR}/build/hello-world/app.js", sampleHandler)
        projectRule.fixture.addPackageJsonFile("${SamCommon.SAM_BUILD_DIR}/build/hello-world")

        runInEdtAndWait {
            val foundElements = Lambda.findPsiElementsForHandler(projectRule.project, Runtime.NODEJS10_X, "app.myLambdaHandler")
            assertThat(foundElements).hasSize(1)
            assertThat(foundElements).allMatch {
                it.containingFile.isEquivalentTo(expectedHandlerFile)
            }
        }
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
            "%PROJECT_ROOT%" to "/",
            "%BUILD_ROOT%" to "/"
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
            "%PROJECT_ROOT%/$subPath" to "/",
            "%BUILD_ROOT%" to "/"
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
            "%PROJECT_ROOT%/$subPath" to "/",
            "%BUILD_ROOT%" to "/"
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
            content = """
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
            "%PROJECT_ROOT%" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun packageLambdaIntoZip() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"

        val handler = projectRule.fixture.addLambdaHandler(subPath)
        projectRule.fixture.addPackageJsonFile()

        val lambdaPackage = sut.packageLambda(projectRule.module, handler, Runtime.NODEJS12_X, "$subPath/$fileName.$handlerName")
        LambdaBuilderTestUtils.verifyZipEntries(
            lambdaPackage,
            "$subPath/$fileName.js",
            "package.json"
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
            "%PROJECT_ROOT%" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun packageInContainer() {
        val subPath = "hello_world"
        val fileName = "app"
        val handlerName = "lambdaHandler"

        val handler = projectRule.fixture.addLambdaHandler(subPath)
        projectRule.fixture.addPackageJsonFile()

        val lambdaPackage = sut.packageLambda(projectRule.module, handler, Runtime.NODEJS12_X, "$subPath/$fileName.$handlerName", true)
        LambdaBuilderTestUtils.verifyZipEntries(
            lambdaPackage,
            "$subPath/$fileName.js",
            "package.json"
        )
    }
}
