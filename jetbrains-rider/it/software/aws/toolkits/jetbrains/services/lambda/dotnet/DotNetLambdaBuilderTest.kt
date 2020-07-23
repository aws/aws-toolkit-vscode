// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import base.AwsReuseSolutionTestBase
import com.intellij.openapi.module.ModuleManager
import com.jetbrains.rider.projectView.solutionDirectory
import com.jetbrains.rider.test.scriptingApi.relativePathToVirtualFile
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.BeforeClass
import org.testng.annotations.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.packageLambda
import software.aws.toolkits.jetbrains.services.lambda.dotnet.element.RiderLambdaHandlerFakePsiElement
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.nio.file.Paths

class DotNetLambdaBuilderTest : AwsReuseSolutionTestBase() {
    override fun getSolutionDirectoryName(): String = "SamHelloWorldApp"

    private val sut = DotNetLambdaBuilder()

    @BeforeClass
    fun setUp() {
        setSamExecutableFromEnvironment()
    }

    @Test
    fun buildFromHandler() {
        val handler = "HelloWorld::HelloWorld.Function::FunctionHandler"
        val module = ModuleManager.getInstance(project).modules.first()

        val handlerResolver = DotNetLambdaHandlerResolver()
        val fieldId = handlerResolver.getFieldIdByHandlerName(project, handler)
        val psiElement = RiderLambdaHandlerFakePsiElement(project, handler, fieldId).navigationElement

        val builtLambda = sut.buildLambda(module, psiElement, handler, Runtime.DOTNETCORE2_1, 0, 0, emptyMap(), SamOptions())
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "HelloWorld.dll",
            "HelloWorld.pdb"
        )

        assertThat(builtLambda.codeLocation).startsWith(project.solutionDirectory.toPath())
    }

    @Test
    fun buildFromTemplate() {
        val template = relativePathToVirtualFile("template.yaml", project.solutionDirectory)
        val templatePath = Paths.get(template.path)
        val module = ModuleManager.getInstance(project).modules.first()

        val builtLambda = sut.buildLambdaFromTemplate(module, templatePath, "HelloWorldFunction")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "HelloWorld.dll",
            "HelloWorld.pdb"
        )

        assertThat(builtLambda.codeLocation).startsWith(project.solutionDirectory.toPath())
    }

    @Test
    fun packageLambda() {
        val handler = "HelloWorld::HelloWorld.Function::FunctionHandler"
        val module = ModuleManager.getInstance(project).modules.first()

        val handlerResolver = DotNetLambdaHandlerResolver()
        val fieldId = handlerResolver.getFieldIdByHandlerName(project, handler)
        val psiElement = RiderLambdaHandlerFakePsiElement(project, handler, fieldId).navigationElement

        val packagedLambda = sut.packageLambda(module, psiElement, Runtime.DOTNETCORE2_1, handler)
        LambdaBuilderTestUtils.verifyZipEntries(
            packagedLambda,
            "HelloWorld.dll",
            "HelloWorld.pdb"
        )
    }
}
