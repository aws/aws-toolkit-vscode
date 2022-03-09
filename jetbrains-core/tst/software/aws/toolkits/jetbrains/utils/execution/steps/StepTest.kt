// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify

class StepTest {
    @Test
    fun `skipping completes step and reports no error`() {
        val skipStep = object : Step() {
            override val stepName: String = "SkipStep"

            override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
                throw SkipStepException()
            }
        }

        val (parentEmitter, childEmitter) = createEmitters()

        skipStep.run(Context(), parentEmitter)

        verify(parentEmitter).createChildEmitter(any(), any())

        verify(childEmitter).stepStarted()
        verify(childEmitter).stepSkipped()
    }

    private fun createEmitters(): Pair<StepEmitter, StepEmitter> {
        val childEmitter = createMockEmitter()
        val parentEmitter = mock<StepEmitter> {
            on { createChildEmitter(any(), any()) } doReturn childEmitter
        }
        return parentEmitter to childEmitter
    }

    private fun createMockEmitter(): StepEmitter = mock {
        on { createChildEmitter(any(), any()) } doAnswer { createMockEmitter() }
    }
}
