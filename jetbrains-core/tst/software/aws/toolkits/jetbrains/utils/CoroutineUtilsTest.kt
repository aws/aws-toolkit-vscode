// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.future.asCompletableFuture
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@Suppress("BlockingMethodInNonBlockingContext") // We use blocking methods to test the coroutines
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
            withContext(getCoroutineUiContext(ModalityState.any())) {
                assertThat(ApplicationManager.getApplication().isDispatchThread).isTrue
            }
        }
    }

    @Test
    fun `getCoroutineBgContext context runs not on UI thread`() {
        runBlocking {
            withContext(getCoroutineBgContext()) {
                assertThat(ApplicationManager.getApplication().isDispatchThread).isFalse
            }
        }
    }

    @Test
    fun `ApplicationThreadPoolScope launches on background thread`() {
        ApplicationThreadPoolScope("CoroutineUtilsTest", disposableRule.disposable).async {
            assertThat(ApplicationManager.getApplication().isDispatchThread).isFalse
        }.asCompletableFuture().get(3, TimeUnit.SECONDS)
    }

    @Test
    fun `dispose canceled the scope`() {
        val computationStarted = CountDownLatch(1)
        val disposeFired = CountDownLatch(1)
        val bgTaskDone = AtomicBoolean(false)

        val disposable = Disposer.newDisposable("CoroutineUtilsTest")

        class TestTarget {
            private val coroutineScope = ApplicationThreadPoolScope("CoroutineUtilsTest", disposable)

            fun computeAsync() = coroutineScope.async {
                computationStarted.countDown()
                disposeFired.await()
                doTask()
            }

            suspend fun doTask() = withContext(getCoroutineBgContext()) {
                bgTaskDone.set(true)
            }
        }

        val future = TestTarget().computeAsync().asCompletableFuture()

        computationStarted.await(10, TimeUnit.SECONDS)

        Disposer.dispose(disposable)
        disposeFired.countDown()

        assertThat(future).failsWithin(Duration.ofSeconds(10)).withThrowableOfType(CancellationException::class.java)
        assertThat(bgTaskDone.get()).isFalse
    }
}
