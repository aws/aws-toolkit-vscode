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
    fun determineHandler_function() {
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
    fun determineHandler_noExportsReturnsNull() {
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
    fun determineHandler_function_noExportsReturnsNull() {
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
    fun determineHandler_oneParameter() {
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
    fun determineHandler_TooManyParametersReturnsNull() {
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
    fun determineHandler_oneParameterForAsync() {
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
    fun determineHandler_ThreeParametersForAsyncReturnsNull() {
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
    fun determineHandler_inSubFolder() {
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
    fun determineHandler_packageJsonFolderAsSourceRoot() {
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
    fun determineHandler_notAFunction() {
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
    fun determineHandler_exportsFunctionSingleParam() {
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
    fun determineHandler_exportsFunctionTwoParam() {
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
    fun determineHandler_exportsFunctionThreeParam() {
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
    fun determineHandler_exportsAsyncFunctionSingleParam() {
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
    fun determineHandler_exportsAsyncFunctionTwoParam() {
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
    fun determineHandler_exportsAsyncFunctionThreeParam() {
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
    fun findPsiElement_exportsAsync1Parameter() {
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
    fun findPsiElement_exportsAsync2Parameters() {
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
    fun findPsiElement_exportsAsync3Parameters() {
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
    fun findPsiElement_noExports() {
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
    fun findPsiElement_notAnAssignment() {
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
    fun findPsiElement_inSubFolderWithNoPackageJson() {
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
    fun findPsiElement_inSubFolderWithPackageJson() {
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
    fun findPsiElement_inSubFolderButHandlerIsNotFullPath() {
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
