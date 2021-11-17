// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.util.concurrency.AppExecutorUtil
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ThreadingUtilsKtTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Test
    fun `computeOnEdt runs on edt`() {
        computeOnEdt {
            ApplicationManager.getApplication().assertIsDispatchThread()
        }
    }

    @Test
    fun `computeOnEdt bubbles out errors`() {
        assertThatThrownBy {
            computeOnEdt {
                throw IllegalStateException("Dummy error")
            }
        }.isInstanceOf<IllegalStateException>()
    }

    @Test
    fun `computeOnEdt respects cancellation`() {
        val latch = CountDownLatch(1)
        try {
            assertThatThrownBy {
                val indicator = EmptyProgressIndicator()
                ProgressManager.getInstance().runProcess(
                    {
                        computeOnEdt {
                            indicator.cancel()
                            latch.await()
                        }
                    },
                    indicator
                )
            }.isInstanceOf<ProcessCanceledException>()
        } finally {
            latch.countDown()
        }
    }

    @Test
    fun `sleepWithCancellation respects cancellation`() {
        val indicator = EmptyProgressIndicator()
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { indicator.cancel() },
            100,
            TimeUnit.MILLISECONDS
        )
        assertThatThrownBy {
            sleepWithCancellation(Duration.ofHours(3), indicator)
        }.isInstanceOf<ProcessCanceledException>()
    }
}
