// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.testFramework.ProjectRule
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import kotlin.test.assertFalse

class HandlerCompletionProviderTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun completionIsNotSupportedJava() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.JAVA8)
        assertFalse(provider.isCompletionSupported)
    }

    @Test
    fun completionIsNotSupportedPython() {
        val provider = HandlerCompletionProvider(projectRule.project, Runtime.PYTHON3_7)
        assertFalse(provider.isCompletionSupported)
    }
}
