// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import software.aws.toolkits.jetbrains.utils.rules.addTypeScriptLambdaHandler

class NodeJsLambdaTypeScriptHandlerResolverTest {
    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    @Test
    fun determineHandler() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler()

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerFunction() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export function lambdaHandler(event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerNoExportsReturnsNull() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                const lambdaHandler = (event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandlerFunctionNoExportsReturnsNull() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                function lambdaHandler(event: APIGatewayProxyEvent, context: Context) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandlerOneParameter() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export const lambdaHandler = (event: APIGatewayProxyEvent) => {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerTooManyParametersReturnsNull() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export const lambdaHandler = (event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>, foo: string) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandlerOneParameterForAsync() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerThreeParametersForAsyncReturnsNull() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandlerInSubFolder() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            subPath = "foo/bar",
            fileContent = """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "foo/bar/app.lambdaHandler")
    }

    @Test
    fun determineHandlerPackageJsonFolderAsSourceRoot() {
        projectRule.fixture.addPackageJsonFile("foo")
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            subPath = "foo/bar",
            fileContent = """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "bar/app.lambdaHandler")
    }

    @Test
    fun determineHandlerNotAFunction() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            subPath = "foo/bar",
            fileContent = """
                export const lambdaHandler = "foo"
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun determineHandlerExportsFunctionSingleParam() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export function lambdaHandler(event: APIGatewayProxyEvent) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerExportsFunctionTwoParam() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export function lambdaHandler(event: APIGatewayProxyEvent, context: Context) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerExportsFunctionThreeParam() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export function lambdaHandler(event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>) {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerExportsAsyncFunctionSingleParam() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerExportsAsyncFunctionTwoParam() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export async function lambdaHandler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, "app.lambdaHandler")
    }

    @Test
    fun determineHandlerExportsAsyncFunctionThreeParam() {
        projectRule.fixture.addPackageJsonFile()
        val handlerElement = projectRule.fixture.addTypeScriptLambdaHandler(
            fileContent = """
                export async function lambdaHandler(event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>): Promise<APIGatewayProxyResult> {
                    return { statusCode: 200 }
                }
            """.trimIndent()
        )

        assertDetermineHandler(handlerElement, null)
    }

    @Test
    fun findPsiElementExportsAsync1Parameter() {
        val fileContent =
            """
                export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("app.ts", fileContent)
        projectRule.fixture.addPackageJsonFile()
        assertFindPsiElements(projectRule, "app.lambdaHandler", true)
    }

    @Test
    fun findPsiElementExportsAsync2Parameters() {
        val fileContent =
            """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("app.ts", fileContent)
        projectRule.fixture.addPackageJsonFile()
        assertFindPsiElements(projectRule, "app.lambdaHandler", true)
    }

    @Test
    fun findPsiElementExportsAsync3Parameters() {
        val fileContent =
            """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("app.ts", fileContent)
        projectRule.fixture.addPackageJsonFile()
        assertFindPsiElements(projectRule, "app.lambdaHandler", false)
    }

    @Test
    fun findPsiElementNoExports() {
        val fileContent =
            """
                const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("app.js", fileContent)
        projectRule.fixture.addPackageJsonFile()
        assertFindPsiElements(projectRule, "app.lambdaHandler", false)
    }

    @Test
    fun findPsiElementNotAnAssignment() {
        val fileContent =
            """
                async function lambdaHandler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("app.ts", fileContent)
        projectRule.fixture.addPackageJsonFile()
        assertFindPsiElements(projectRule, "app.lambdaHandler", false)
    }

    @Test
    fun findPsiElementInSubFolderWithNoPackageJson() {
        val fileContent =
            """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("foo/app.ts", fileContent)
        assertFindPsiElements(projectRule, "foo/app.lambdaHandler", false)
    }

    @Test
    fun findPsiElementInSubFolderWithPackageJson() {
        val fileContent =
            """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("foo/bar/app.ts", fileContent)
        projectRule.fixture.addPackageJsonFile("foo")
        assertFindPsiElements(projectRule, "bar/app.lambdaHandler", true)
        assertFindPsiElements(projectRule, "foo/bar/app.lambdaHandler", false)
    }

    @Test
    fun findPsiElementInSubFolderButHandlerIsNotFullPath() {
        val fileContent =
            """
                export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                    return { statusCode: 200 }
                }
            """.trimIndent()

        projectRule.fixture.addFileToProject("foo/app.ts", fileContent)
        projectRule.fixture.addPackageJsonFile()
        assertFindPsiElements(projectRule, "app.lambdaHandler", false)
    }
}
