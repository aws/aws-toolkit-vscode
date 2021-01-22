// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule

class NodeJsHandlerCompletionProviderTest {
    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    @Test
    fun completionIsNotSupportedNodeJs10X() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.NODEJS10_X)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs12X() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.NODEJS12_X)
        assertFalse(provider.isCompletionSupported)
    }
}
