// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class StepExecutorTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var workflowEmitter: WorkflowEmitter
    private lateinit var successCallback: (Context) -> Unit
    private lateinit var errorCallback: (Throwable) -> Unit

    @Before
    fun setUp() {
        workflowEmitter = mock {
            on { createStepEmitter() } doAnswer { createMockEmitter() }
        }
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
        verifyNoMoreInteractions(errorCallback)

        verify(workflowEmitter).workflowStarted()
        verify(workflowEmitter).workflowCompleted()
    }

    @Test
    fun `an error in a step skips rest of the steps and invokes error callback`() {
        val step1 = mock<Step> {
            on { run(any(), any(), any()) }.thenThrow(IllegalStateException("Simulated"))
        }
        val step2 = mock<Step>()

        createExecutor(step1, step2).startExecution().waitFor(2_000)

        verify(step1).run(any(), any(), any())
        verifyNoMoreInteractions(step2)
        verifyNoMoreInteractions(successCallback)
        verify(errorCallback).invoke(any())

        verify(workflowEmitter).workflowStarted()
        verify(workflowEmitter).workflowFailed(any())
    }

    @Test
    fun `an error in success callback leads to error callback`() {
        successCallback.stub {
            on { invoke(any()) }.thenThrow(IllegalStateException("Simulated"))
        }

        createExecutor().startExecution().waitFor(2_000)

        verify(successCallback).invoke(any())
        verify(errorCallback).invoke(any())

        verify(workflowEmitter).workflowStarted()
        verify(workflowEmitter).workflowFailed(any())
    }

    @Test
    fun `stopping the process handler will cancel the workflow steps and skip success callback`() {
        val stepStarted = CountDownLatch(1)
        val stepPaused = CountDownLatch(1)
        val step1 = mock<Step> {
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

        verifyNoMoreInteractions(successCallback)
        verify(errorCallback).invoke(any())

        verify(workflowEmitter).workflowStarted()
        verify(workflowEmitter).workflowFailed(any())
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

        verify(workflowEmitter).workflowStarted()
        verify(workflowEmitter).workflowFailed(any())
    }

    private fun createMockEmitter(): StepEmitter = mock {
        on { createChildEmitter(any(), any()) } doAnswer { createMockEmitter() }
    }

    private fun createExecutor(vararg steps: Step): StepExecutor {
        val executor = StepExecutor(projectRule.project, StepWorkflow(*steps), workflowEmitter)
        executor.onSuccess = successCallback
        executor.onError = errorCallback
        return executor
    }
}
