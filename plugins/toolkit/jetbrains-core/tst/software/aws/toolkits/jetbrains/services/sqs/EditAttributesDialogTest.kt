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
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.stub
import software.amazon.awssdk.awscore.exception.AwsServiceException
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.amazon.awssdk.services.sqs.model.SetQueueAttributesRequest
import software.amazon.awssdk.services.sqs.model.SetQueueAttributesResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion

class EditAttributesDialogTest {
    lateinit var client: SqsClient
    lateinit var queue: Queue

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @Before
    fun setUp() {
        client = mockClientManagerRule.create()
        queue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/test", getDefaultRegion())
    }

    @Test
    fun `Empty field fails`() {
        runInEdtAndWait {
            listOf(
                buildDialog(testRetentionPeriod = null),
                buildDialog(testMessageSize = null)
            ).forEach { dialog ->
                assertThat(dialog.validate()).isNotNull()
            }
        }
    }

    @Test
    fun `Value out of bound fails`() {
        runInEdtAndWait {
            listOf(
                buildDialog(visibilityTimeout = MAX_VISIBILITY_TIMEOUT + 1),
                buildDialog(visibilityTimeout = MIN_VISIBILITY_TIMEOUT - 1),
                buildDialog(maxDeliveryDelay = MAX_DELIVERY_DELAY + 1),
                buildDialog(maxDeliveryDelay = MIN_DELIVERY_DELAY - 1),
                buildDialog(waitTime = MAX_WAIT_TIME + 1),
                buildDialog(waitTime = MIN_WAIT_TIME - 1),
                buildDialog(testRetentionPeriod = MAX_RETENTION_PERIOD + 1),
                buildDialog(testRetentionPeriod = MIN_RETENTION_PERIOD - 1),
                buildDialog(testMessageSize = MAX_MESSAGE_SIZE_LIMIT + 1),
                buildDialog(testMessageSize = MIN_MESSAGE_SIZE_LIMIT - 1)
            ).forEach { dialog ->
                assertThat(dialog.validate()).isNotNull()
            }
        }
    }

    @Test
    fun `Editing queue parameters succeeds`() {
        val attributesCaptor = argumentCaptor<SetQueueAttributesRequest>()
        client.stub {
            on { setQueueAttributes(attributesCaptor.capture()) } doReturn SetQueueAttributesResponse.builder().build()
        }

        runInEdtAndWait {
            buildDialog().updateAttributes()
        }

        val updatedAttributes = attributesCaptor.firstValue.attributes()
        assertThat(updatedAttributes[QueueAttributeName.VISIBILITY_TIMEOUT]).isEqualTo(MAX_VISIBILITY_TIMEOUT.toString())
        assertThat(updatedAttributes[QueueAttributeName.MAXIMUM_MESSAGE_SIZE]).isEqualTo(MAX_MESSAGE_SIZE_LIMIT.toString())
        assertThat(updatedAttributes[QueueAttributeName.MESSAGE_RETENTION_PERIOD]).isEqualTo(MAX_RETENTION_PERIOD.toString())
        assertThat(updatedAttributes[QueueAttributeName.DELAY_SECONDS]).isEqualTo(MAX_DELIVERY_DELAY.toString())
        assertThat(updatedAttributes[QueueAttributeName.RECEIVE_MESSAGE_WAIT_TIME_SECONDS]).isEqualTo(MAX_WAIT_TIME.toString())
    }

    @Test
    fun `Error editing queue parameters`() {
        val message = "Internal error"

        client.stub {
            on { setQueueAttributes(any<SetQueueAttributesRequest>()) } doThrow AwsServiceException.builder().message(message).build()
        }

        runInEdtAndWait {
            assertThatThrownBy { buildDialog().updateAttributes() }.hasMessage(message)
        }
    }

    private fun buildDialog(
        visibilityTimeout: Int = MAX_VISIBILITY_TIMEOUT,
        maxDeliveryDelay: Int = MAX_DELIVERY_DELAY,
        waitTime: Int = MAX_WAIT_TIME,
        testRetentionPeriod: Int? = MAX_RETENTION_PERIOD,
        testMessageSize: Int? = MAX_MESSAGE_SIZE_LIMIT
    ) = EditAttributesDialog(projectRule.project, client, queue, mapOf()).apply {
        view.visibilityTimeout.value = visibilityTimeout
        view.messageSize.text = testMessageSize?.toString() ?: ""
        view.retentionPeriod.text = testRetentionPeriod?.toString() ?: ""
        view.deliveryDelay.value = maxDeliveryDelay
        view.waitTime.value = waitTime
    }
}
