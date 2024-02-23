// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import base.AwsReuseSolutionTestBase
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.DataProvider
import org.testng.annotations.Ignore
import org.testng.annotations.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.utils.OPEN_SOLUTION_DIR_NAME

class DotNetHandlerCompletionProviderTest : AwsReuseSolutionTestBase() {

    override fun getSolutionDirectoryName(): String = OPEN_SOLUTION_DIR_NAME

    override val waitForCaches = true

    @DataProvider(name = "handlerCompletionSupportedData")
    fun handlerCompletionSupportData() = arrayOf(
        arrayOf("DotNet60", LambdaRuntime.DOTNET6_0)
    )

    @Ignore("test for 232")
    @Test(
        dataProvider = "handlerCompletionSupportedData",
        description = "Check completion in run configuration feature is enabled for DOTNET runtime."
    )
    fun `testCompletion is SupportedForDotNetRuntime`(name: String, runtime: LambdaRuntime) {
        val provider = HandlerCompletionProvider(project, runtime)
        assertThat(provider.isCompletionSupported).isTrue()
    }
}
