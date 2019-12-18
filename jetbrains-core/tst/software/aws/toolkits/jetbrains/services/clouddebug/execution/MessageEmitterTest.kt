// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution

import com.intellij.build.BuildView
import com.intellij.build.events.BuildEvent
import com.intellij.build.events.FailureResult
import com.intellij.build.events.FinishEvent
import com.intellij.build.events.OutputBuildEvent
import com.intellij.build.events.StartEvent
import com.intellij.build.events.SuccessResult
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.junit.MockitoJUnit
import org.mockito.junit.MockitoRule

@Suppress("UnstableApiUsage")
class MessageEmitterTest {
    @Rule
    @JvmField
    val mockRule: MockitoRule = MockitoJUnit.rule()

    private val buildView = mock<BuildView>()
    private val rootEmitter = DefaultMessageEmitter.createRoot(buildView, PARENT_ID)

    @Test
    fun startEventIsWritten() {

        val stepId = "ChildStep"

        val messageEmitter = rootEmitter.createChild(stepId)

        messageEmitter.startStep()

        argumentCaptor<BuildEvent>().apply {
            verify(buildView).onEvent(eq(PARENT_ID), capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(PARENT_ID)
            }.isInstanceOfSatisfying(StartEvent::class.java) {
                assertThat(it.message).isEqualTo(stepId)
            }
        }
    }

    @Test
    fun finishEventIsWritten() {
        val parentId = "ParentStep"
        val stepId = "ChildStep"

        val messageEmitter = rootEmitter.createChild(stepId)

        messageEmitter.finishSuccessfully()

        argumentCaptor<BuildEvent>().apply {
            verify(buildView).onEvent(eq(PARENT_ID), capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(parentId)
                assertThat(it.id).isEqualTo(stepId)
            }.isInstanceOfSatisfying(FinishEvent::class.java) {
                assertThat(it.message).isEqualTo(stepId)
                assertThat(it.result).isInstanceOf(SuccessResult::class.java)
            }
        }
    }

    @Test
    fun finishWithErrorEventIsWritten() {
        val parentId = "ParentStep"
        val stepId = "ChildStep"

        val messageEmitter = rootEmitter.createChild(stepId)

        messageEmitter.finishExceptionally(NullPointerException("Test exception"))

        argumentCaptor<BuildEvent>().apply {
            verify(buildView, times(3)).onEvent(eq(PARENT_ID), capture())

            assertThat(allValues).hasSize(3)

            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(parentId)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo("ChildStep finished exceptionally: java.lang.NullPointerException: Test exception")
                assertThat(it.isStdOut).isFalse()
            }

            assertThat(secondValue).satisfies {
                assertThat(it.parentId).isEqualTo(stepId)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo("ChildStep finished exceptionally: java.lang.NullPointerException: Test exception")
                assertThat(it.isStdOut).isFalse()
            }

            assertThat(thirdValue).satisfies {
                assertThat(it.parentId).isEqualTo(parentId)
                assertThat(it.id).isEqualTo(stepId)
            }.isInstanceOfSatisfying(FinishEvent::class.java) {
                assertThat(it.message).isEqualTo(stepId)
                assertThat(it.result).isInstanceOf(FailureResult::class.java)
            }
        }
    }

    @Test
    fun messageIsWrittenToChildAndParent() {
        val stepId = "ChildStep"
        val message = "A message"

        val messageEmitter = rootEmitter.createChild(stepId)

        messageEmitter.emitMessage(message, false)

        argumentCaptor<BuildEvent>().apply {
            verify(buildView, times(2)).onEvent(eq(PARENT_ID), capture())

            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(PARENT_ID)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo(message)
                assertThat(it.isStdOut).isTrue()
            }

            assertThat(secondValue).satisfies {
                assertThat(it.parentId).isEqualTo(stepId)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo(message)
                assertThat(it.isStdOut).isTrue()
            }
        }
    }

    @Test
    fun messageIsWrittenAsError() {
        val stepId = "ChildStep"
        val message = "A message"

        val messageEmitter = rootEmitter.createChild(stepId)

        messageEmitter.emitMessage(message, true)

        argumentCaptor<BuildEvent>().apply {
            verify(buildView, times(2)).onEvent(eq(PARENT_ID), capture())

            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(PARENT_ID)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo(message)
                assertThat(it.isStdOut).isFalse()
            }

            assertThat(secondValue).satisfies {
                assertThat(it.parentId).isEqualTo(stepId)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo(message)
                assertThat(it.isStdOut).isFalse()
            }
        }
    }

    @Test
    fun parentIdIsCorrect() {
        val childId1 = "ChildStep1"
        val childId2 = "ChildStep2"

        val messageEmitter = rootEmitter.createChild(childId1).createChild(childId2)

        messageEmitter.startStep()

        argumentCaptor<BuildEvent>().apply {
            verify(buildView).onEvent(eq(PARENT_ID), capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(childId1)
            }.isInstanceOfSatisfying(StartEvent::class.java) {
                assertThat(it.message).isEqualTo(childId2)
            }
        }
    }

    @Test
    fun hiddenMessageEmittersDontPublishEvents() {
        val hidden = "HiddenStep"
        val message = "A message"
        val hiddenEmitter = rootEmitter.createChild(hidden, hidden = true)

        hiddenEmitter.emitMessage(message, false)

        argumentCaptor<BuildEvent>().apply {
            verify(buildView).onEvent(eq(PARENT_ID), capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).satisfies {
                assertThat(it.parentId).isEqualTo(PARENT_ID)
            }.isInstanceOfSatisfying(OutputBuildEvent::class.java) {
                assertThat(it.message).isEqualTo(message)
            }
        }
    }

    companion object {
        private const val PARENT_ID = "ParentStep"
    }
}
