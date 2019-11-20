// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.application.invokeAndWaitIfNeeded
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.java.BaseLambdaBuilderTest
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import software.aws.toolkits.jetbrains.utils.rules.addSamTemplate
import java.nio.file.Paths

class NodeJsLambdaBuilderTest : BaseLambdaBuilderTest() {
    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    override val lambdaBuilder: LambdaBuilder
        get() = NodeJsLambdaBuilder()

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
        val builtLambda = buildLambda(module, handler, Runtime.NODEJS8_10, "$subPath/$fileName.$handlerName")
        verifyEntries(
            builtLambda,
            "$subPath/$fileName.js",
            "package.json"
        )
        verifyPathMappings(
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

        val builtLambda = buildLambda(module, handler, Runtime.NODEJS8_10, "$fileName.$handlerName")
        verifyEntries(
            builtLambda,
            "$fileName.js",
            "package.json"
        )
        verifyPathMappings(
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
            runtime = Runtime.NODEJS8_10
        )
        val templatePath = Paths.get(templateFile.virtualFile.path)

        val builtLambda = buildLambdaFromTemplate(projectRule.module, templatePath, logicalName)

        verifyEntries(
            builtLambda,
            "$fileName.js",
            "package.json"
        )
        verifyPathMappings(
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
        val builtLambda = buildLambda(module, handler, Runtime.NODEJS8_10, "$subPath/$fileName.$handlerName")
        verifyEntries(
            builtLambda,
            "$subPath/$fileName.js",
            "node_modules/axios/package.json",
            "package.json"
        )
        verifyPathMappings(
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

        val lambdaPackage = packageLambda(projectRule.module, handler, Runtime.NODEJS8_10, "$subPath/$fileName.$handlerName")
        verifyZipEntries(
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

        val builtLambda = buildLambda(projectRule.module, handler, Runtime.NODEJS8_10, "$subPath/$fileName.$handlerName", true)
        verifyEntries(
            builtLambda,
            "$subPath/$fileName.js",
            "package.json"
        )
        verifyPathMappings(
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

        val lambdaPackage = packageLambda(projectRule.module, handler, Runtime.NODEJS8_10, "$subPath/$fileName.$handlerName", true)

        verifyZipEntries(
            lambdaPackage,
            "$subPath/$fileName.js",
            "package.json"
        )
    }
}
