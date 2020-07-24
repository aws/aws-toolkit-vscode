// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import base.AwsReuseSolutionTestBase
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.DataProvider
import org.testng.annotations.Test
import software.amazon.awssdk.services.lambda.model.Runtime

class DotNetHandlerCompletionProviderTest : AwsReuseSolutionTestBase() {

    override fun getSolutionDirectoryName(): String = "SamHelloWorldApp"

    override val waitForCaches = true

    @DataProvider(name = "handlerCompletionSupportedData")
    fun handlerCompletionSupportData() = arrayOf(
        arrayOf("DotNet10", Runtime.DOTNETCORE1_0),
        arrayOf("DotNet20", Runtime.DOTNETCORE2_0),
        arrayOf("DotNet21", Runtime.DOTNETCORE2_1),
        arrayOf("DotNet31", Runtime.DOTNETCORE3_1)
    )

    @Test(dataProvider = "handlerCompletionSupportedData",
        description = "Check completion in run configuration feature is enabled for DOTNET runtime.")
    fun testCompletion_IsSupportedForDotNetRuntime(name: String, runtime: Runtime) {
        val provider = HandlerCompletionProvider(project, runtime)
        assertThat(provider.isCompletionSupported).isTrue()
    }
}
