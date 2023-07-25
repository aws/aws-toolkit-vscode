// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import base.AwsReuseSolutionTestBase
import com.intellij.openapi.module.ModuleManager
import com.intellij.psi.search.GlobalSearchScope
import com.jetbrains.rider.projectView.solutionDirectory
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.Test
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.utils.OPEN_SOLUTION_DIR_NAME

class DotNetLambdaBuilderTest : AwsReuseSolutionTestBase() {
    override fun getSolutionDirectoryName(): String = OPEN_SOLUTION_DIR_NAME

    private val sut = DotNetLambdaBuilder()

    @Test
    fun handlerBaseDirIsCorrect() {
        // Use DotNetLambdaHandlerResolver() since we need to talk to Resharper backend
        val handler = DotNetLambdaHandlerResolver().findPsiElements(
            project,
            "HelloWorld::HelloWorld.Function::FunctionHandler",
            GlobalSearchScope.projectScope(project)
        ).first()

        val baseDir = sut.handlerBaseDirectory(ModuleManager.getInstance(project).modules.first(), handler)
        assertThat(baseDir.toAbsolutePath()).isEqualTo(project.solutionDirectory.toPath().resolve("src").resolve("HelloWorld"))
    }

    @Test
    fun buildDirectoryIsCorrect() {
        val baseDir = sut.getBuildDirectory(ModuleManager.getInstance(project).modules.first())
        assertThat(baseDir).isEqualTo(project.solutionDirectory.toPath().resolve(SamCommon.SAM_BUILD_DIR).resolve("build"))
    }
}
