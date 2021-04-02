// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.CreateQueueRequest
import software.amazon.awssdk.services.sqs.model.CreateQueueResponse
import software.amazon.awssdk.services.sqs.model.QueueNameExistsException
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

class CreateQueueDialogTest {
    lateinit var client: SqsClient

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @Before
    fun setup() {
        client = mockClientManagerRule.create()
    }

    @Test
    fun `Empty queue name fails`() {
        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = ""
            }

            val validationInfo = dialog.validate()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun `Invalid queue name fails`() {
        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = INVALID_NAME
            }

            val validationInfo = dialog.validate()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun `Too long standard queue name fails`() {
        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = RuleUtils.randomName(length = MAX_LENGTH_OF_QUEUE_NAME + 1)
            }

            val validationInfo = dialog.validate()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun `Too long fifo queue name fails`() {
        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = RuleUtils.randomName(length = MAX_LENGTH_OF_FIFO_QUEUE_NAME + 1)
            }

            val validationInfo = dialog.validate()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun `Standard queue created`() {
        val createQueueCaptor = argumentCaptor<CreateQueueRequest>()
        client.stub {
            on { createQueue(createQueueCaptor.capture()) } doReturn CreateQueueResponse.builder().build()
        }

        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = VALID_NAME
            }
            dialog.createQueue()
        }

        assertThat(createQueueCaptor.firstValue.queueName()).isEqualTo(VALID_NAME)
    }

    @Test
    fun `Fifo queue created`() {
        val createQueueCaptor = argumentCaptor<CreateQueueRequest>()
        client.stub {
            on { createQueue(createQueueCaptor.capture()) } doReturn CreateQueueResponse.builder().build()
        }

        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = VALID_NAME
                view.fifoType.isSelected = true
            }
            dialog.createQueue()
        }

        assertThat(createQueueCaptor.firstValue.queueName()).isEqualTo(VALID_NAME_FIFO)
    }

    @Test
    fun `Error creating queue`() {
        val createQueueCaptor = argumentCaptor<CreateQueueRequest>()
        client.stub {
            on { createQueue(createQueueCaptor.capture()) } doThrow QueueNameExistsException.builder().message(ERROR_MESSAGE).build()
        }

        runInEdtAndWait {
            val dialog = CreateQueueDialog(projectRule.project, client).apply {
                view.queueName.text = VALID_NAME
            }
            assertThatThrownBy { dialog.createQueue() }.hasMessage(ERROR_MESSAGE)
        }

        assertThat(createQueueCaptor.firstValue.queueName()).isEqualTo(VALID_NAME)
    }

    private companion object {
        const val INVALID_NAME = "Hello_World!"
        const val VALID_NAME = "Hello-World"
        const val VALID_NAME_FIFO = "Hello-World.fifo"
        const val ERROR_MESSAGE = "Queue already exists."
    }
}
