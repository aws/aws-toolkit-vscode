// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class PythonHandlerCompletionProviderTest {

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun completionIsNotSupportedPython27() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.PYTHON2_7)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython36() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.PYTHON3_6)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython37() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.PYTHON3_7)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython38() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.PYTHON3_8)
        assertFalse(provider.isCompletionSupported)
    }
}
