// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.lang.javascript.psi.JSDefinitionExpression
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile

class NodeJsLambdaHandlerResolverTest {
    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    @Test
    fun determineHandler() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler"
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandler_noExportsReturnsNull() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                lambdaHandler = async (event, context) => {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandler_oneParameter() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = function(event) {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandler_TooManyParametersReturnsNull() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = function(event, context, callback, foo) {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandler_oneParameterForAsync() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = async (event) => {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandler_ThreeParametersForAsyncReturnsNull() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = async (event, context, callback) => {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandler_es5Code() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = ".",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = function(event, context, callback) {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandler_inSubFolder() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = async (event, context) => {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "foo/bar/app.lambdaHandler")
    }

    @Test
    fun determineHandler_packageJsonFolderAsSourceRoot() {
        projectRule.fixture.addPackageJsonFile("foo")

        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = async (event, context) => {
                    return "Hello World"
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "bar/app.lambdaHandler")
    }

    @Test
    fun determineHandler_notAFunction() {
        val handlerElement = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app",
            handlerName = "lambdaHandler",
            fileContent = """
                exports.lambdaHandler = "foo"
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun findPsiElement_exportsAsync2Parameters() {
        val fileContent = """
            exports.lambdaHandler = async (event, context) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("app.js", fileContent)
        assertFindPsiElements("app.lambdaHandler", true)
    }

    @Test
    fun findPsiElement_exportsAsync3Parameters() {
        val fileContent = """
            exports.lambdaHandler = async (event, context, callback) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("app.js", fileContent)
        assertFindPsiElements("app.lambdaHandler", false)
    }

    @Test
    fun findPsiElement_exportsAsync1Parameter() {
        val fileContent = """
            exports.lambdaHandler = async (event) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("app.js", fileContent)
        assertFindPsiElements("app.lambdaHandler", true)
    }

    @Test
    fun findPsiElement_noExports() {
        val fileContent = """
            var lambdaHandler = async (event, context) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("app.js", fileContent)
        assertFindPsiElements("app.lambdaHandler", false)
    }

    @Test
    fun findPsiElement_notAnAssignment() {
        val fileContent = """
            async function lambdaHandler(event, context) {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("app.js", fileContent)
        assertFindPsiElements("app.lambdaHandler", false)
    }

    @Test
    fun findPsiElement_inSubFolderWithNoPackageJson() {
        val fileContent = """
            exports.lambdaHandler = async (event, context) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("foo/app.js", fileContent)
        assertFindPsiElements("foo/app.lambdaHandler", true)
    }

    @Test
    fun findPsiElement_inSubFolderWithPackageJson() {
        val fileContent = """
            exports.lambdaHandler = async (event, context) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("foo/bar/app.js", fileContent)
        projectRule.fixture.addPackageJsonFile("foo")
        assertFindPsiElements("bar/app.lambdaHandler", true)
        assertFindPsiElements("foo/bar/app.lambdaHandler", false)
    }

    @Test
    fun findPsiElement_inSubFolderButHandlerIsNotFullPath() {
        val fileContent = """
            exports.lambdaHandler = async (event, context) => {
                return "Hello World";
            }
        """.trimIndent()

        projectRule.fixture.addFileToProject("foo/app.js", fileContent)
        assertFindPsiElements("app.lambdaHandler", false)
    }

    private fun assertDetermineHandler(handlerElement: PsiElement, expectedHandlerFullName: String?) {
        val resolver = LambdaHandlerResolver.getInstanceOrThrow(RuntimeGroup.NODEJS)

        runInEdtAndWait {
            if (expectedHandlerFullName != null) {
                assertThat(resolver.determineHandler(handlerElement)).isEqualTo(expectedHandlerFullName)
            } else {
                assertThat(resolver.determineHandler(handlerElement)).isNull()
            }
        }
    }

    private fun assertFindPsiElements(handler: String, shouldBeFound: Boolean) {
        val resolver = LambdaHandlerResolver.getInstanceOrThrow(RuntimeGroup.NODEJS)
        runInEdtAndWait {
            val project = projectRule.fixture.project
            val lambdas = resolver.findPsiElements(project, handler, GlobalSearchScope.allScope(project))
            if (shouldBeFound) {
                assertThat(lambdas).hasSize(1)
                assertThat(lambdas[0]).isInstanceOf(JSDefinitionExpression::class.java)
            } else {
                assertThat(lambdas).isEmpty()
            }
        }
    }
}
