// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildProgressListener
import com.intellij.build.events.BuildEvent
import com.intellij.build.events.FailureResult
import com.intellij.build.events.FinishBuildEvent
import com.intellij.build.events.FinishEvent
import com.intellij.build.events.OutputBuildEvent
import com.intellij.build.events.StartBuildEvent
import com.intellij.build.events.SuccessResult
import com.intellij.build.events.impl.SkippedResultImpl
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyZeroInteractions
import software.aws.toolkits.core.utils.test.aString
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class StepExecutorTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var buildProgressListener: BuildProgressListener
    private lateinit var successCallback: (Context) -> Unit
    private lateinit var errorCallback: (Throwable) -> Unit

    @Before
    fun setUp() {
        buildProgressListener = mock()
        successCallback = mock()
        errorCallback = mock()
    }

    @Test
    fun `success callback is invoked when no steps fail`() {
        val step1 = mock<Step>()
        val step2 = mock<Step>()

        createExecutor(step1, step2).startExecution().waitFor(2_000)

        verify(step1).run(any(), any(), any())
        verify(step2).run(any(), any(), any())
        verify(successCallback).invoke(any())
        verifyZeroInteractions(errorCallback)

        argumentCaptor<BuildEvent> {
            verify(buildProgressListener, times(2)).onEvent(any(), capture())

            assertThat(firstValue).isInstanceOf(StartBuildEvent::class.java)
            assertThat(secondValue).isInstanceOfSatisfying(FinishEvent::class.java) {
                assertThat(it.result).isInstanceOf(SuccessResult::class.java)
            }
        }
    }

    @Test
    fun `an error in a step skips rest of the steps and invokes error callback`() {
        val step1 = mock<Step> {
            on { run(any(), any(), any()) }.thenThrow(IllegalStateException("Simulated"))
        }
        val step2 = mock<Step>()

        createExecutor(step1, step2).startExecution().waitFor(2_000)

        verify(step1).run(any(), any(), any())
        verifyZeroInteractions(step2)
        verifyZeroInteractions(successCallback)
        verify(errorCallback).invoke(any())

        argumentCaptor<BuildEvent> {
            verify(buildProgressListener, times(3)).onEvent(any(), capture())

            assertThat(firstValue).isInstanceOf(StartBuildEvent::class.java)
            assertThat(secondValue).isInstanceOf(OutputBuildEvent::class.java)
            assertThat(thirdValue).isInstanceOfSatisfying(FinishBuildEvent::class.java) {
                assertThat(it.result).isInstanceOf(FailureResult::class.java)
                assertThat(it.message).contains("failed")
            }
        }
    }

    @Test
    fun `an error in success callback leads to error callback`() {
        successCallback.stub {
            on { invoke(any()) }.thenThrow(IllegalStateException("Simulated"))
        }

        createExecutor().startExecution().waitFor(2_000)

        verify(successCallback).invoke(any())
        verify(errorCallback).invoke(any())

        argumentCaptor<BuildEvent> {
            verify(buildProgressListener, times(2)).onEvent(any(), capture())

            assertThat(firstValue).isInstanceOf(StartBuildEvent::class.java)
            assertThat(secondValue).isInstanceOfSatisfying(FinishBuildEvent::class.java) {
                assertThat(it.result).isInstanceOf(FailureResult::class.java)
                assertThat(it.message).contains("failed")
            }
        }
    }

    @Test
    fun `stopping the process handler will cancel the workflow steps and skip success callback`() {
        val stepStarted = CountDownLatch(1)
        val stepPaused = CountDownLatch(1)
        val step1 = mock<Step>() {
            on { run(any(), any(), any()) }.thenAnswer {
                stepStarted.countDown()
                stepPaused.await()
            }
        }
        val step2 = mock<Step>()

        val execution = createExecutor(step1, step2).startExecution()

        assertThat(stepStarted.await(3, TimeUnit.SECONDS)).isTrue

        execution.destroyProcess()
        stepPaused.countDown()
        execution.waitFor(2_000)

        verifyZeroInteractions(successCallback)
        verify(errorCallback).invoke(any())

        argumentCaptor<BuildEvent> {
            verify(buildProgressListener, times(2)).onEvent(any(), capture())

            assertThat(firstValue).isInstanceOf(StartBuildEvent::class.java)
            assertThat(secondValue).isInstanceOfSatisfying(FinishBuildEvent::class.java) {
                assertThat(it.result).isInstanceOf(SkippedResultImpl::class.java)
                assertThat(it.message).contains("canceled")
            }
        }
    }

    @Test
    fun `error in error callback still finishes the workflow`() {
        successCallback.stub {
            on { invoke(any()) }.thenThrow(IllegalStateException("Simulated"))
        }

        errorCallback.stub {
            on { invoke(any()) }.thenThrow(IllegalStateException("Simulated 2"))
        }

        createExecutor().startExecution().waitFor(2_000)

        verify(successCallback).invoke(any())
        verify(errorCallback).invoke(any())

        argumentCaptor<BuildEvent> {
            verify(buildProgressListener, times(2)).onEvent(any(), capture())

            assertThat(firstValue).isInstanceOf(StartBuildEvent::class.java)
            assertThat(secondValue).isInstanceOfSatisfying(FinishBuildEvent::class.java) {
                assertThat(it.result).isInstanceOf(FailureResult::class.java)
            }
        }
    }

    private fun createExecutor(vararg steps: Step): StepExecutor {
        val executor = StepExecutor(projectRule.project, aString(), StepWorkflow(*steps), aString(), buildProgressListener)
        executor.onSuccess = successCallback
        executor.onError = errorCallback
        return executor
    }
}
