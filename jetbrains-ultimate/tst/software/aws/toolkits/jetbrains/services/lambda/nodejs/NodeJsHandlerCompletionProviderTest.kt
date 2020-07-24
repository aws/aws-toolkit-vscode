// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule

class NodeJsHandlerCompletionProviderTest {

    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    @Test
    fun completionIsNotSupportedNodeJs() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs43() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS4_3)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs43Edge() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS4_3_EDGE)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs610() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS6_10)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs810() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS8_10)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs10X() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS10_X)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedNodeJs12X() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.NODEJS12_X)
        assertFalse(provider.isCompletionSupported)
    }
}
