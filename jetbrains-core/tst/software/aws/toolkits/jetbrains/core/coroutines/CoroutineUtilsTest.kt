// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.coroutines

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test

class CoroutineUtilsTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Test
    fun `getCoroutineUiContext context runs on UI thread`() {
        runBlocking {
            assertThat(ApplicationManager.getApplication().isDispatchThread).isFalse
            withContext(getCoroutineUiContext()) {
                assertThat(ApplicationManager.getApplication().isDispatchThread).isTrue
            }
        }
    }

    @Test
    fun `getCoroutineBgContext context runs not on UI thread`() {
        runInEdtAndWait {
            assertThat(ApplicationManager.getApplication().isDispatchThread).isTrue
            runBlocking {
                withContext(getCoroutineBgContext()) {
                    assertThat(ApplicationManager.getApplication().isDispatchThread).isFalse
                }
            }
        }
    }
}
