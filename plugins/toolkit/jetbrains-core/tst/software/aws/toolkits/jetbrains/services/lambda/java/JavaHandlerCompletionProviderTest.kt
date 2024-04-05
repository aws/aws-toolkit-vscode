// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

class JavaHandlerCompletionProviderTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun completionIsNotSupportedJava8() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.JAVA8_AL2)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedJava11() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.JAVA11)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedJava17() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.JAVA17)
        assertFalse(provider.isCompletionSupported)
    }
}
