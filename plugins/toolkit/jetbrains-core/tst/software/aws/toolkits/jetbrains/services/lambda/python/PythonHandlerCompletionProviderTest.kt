// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class PythonHandlerCompletionProviderTest {

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun completionIsNotSupportedPython38() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.PYTHON3_8)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython39() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.PYTHON3_9)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython310() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.PYTHON3_10)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython311() {
        val provider = HandlerCompletionProvider(projectRule.project, LambdaRuntime.PYTHON3_11)
        assertFalse(provider.isCompletionSupported)
    }
}
