// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

class JavaHandlerCompletionProviderTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun completionIsNotSupportedJava8() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.JAVA8)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedJava11() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.JAVA11)
        assertFalse(provider.isCompletionSupported)
    }
}
