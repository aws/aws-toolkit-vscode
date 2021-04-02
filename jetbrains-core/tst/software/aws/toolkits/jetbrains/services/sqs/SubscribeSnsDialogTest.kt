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
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.sns.SnsClient
import software.amazon.awssdk.services.sns.model.InternalErrorException
import software.amazon.awssdk.services.sns.model.SubscribeRequest
import software.amazon.awssdk.services.sns.model.SubscribeResponse
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesResponse
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule

class SubscribeSnsDialogTest {
    lateinit var snsClient: SnsClient
    lateinit var sqsClient: SqsClient
    lateinit var iamClient: IamClient
    lateinit var region: AwsRegion
    lateinit var queue: Queue

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @JvmField
    @Rule
    val regionProvider = MockRegionProviderRule()

    @Before
    fun setup() {
        snsClient = mockClientManagerRule.create()
        sqsClient = mockClientManagerRule.create()
        iamClient = mockClientManagerRule.create()
        sqsClient.stub {
            on { getQueueAttributes(any<GetQueueAttributesRequest>()) } doReturn GetQueueAttributesResponse.builder().attributes(
                mutableMapOf<QueueAttributeName, String?>(
                    QueueAttributeName.POLICY to null
                )
            ).build()
        }

        region = regionProvider.defaultRegion()
        queue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/test", region)
    }

    @Test
    fun `No topic specified fails`() {
        runInEdtAndWait {
            val dialog = SubscribeSnsDialog(projectRule.project, queue)
            val validationInfo = dialog.validate()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun `Error subscribing to topic`() {
        val subscribeCaptor = argumentCaptor<SubscribeRequest>()
        snsClient.stub {
            on { subscribe(subscribeCaptor.capture()) } doThrow InternalErrorException.builder().message(ERROR_MESSAGE).build()
        }

        runInEdtAndWait {
            val dialog = SubscribeSnsDialog(projectRule.project, queue)
            assertThatThrownBy { dialog.subscribe(TOPIC_ARN) }.hasMessage(ERROR_MESSAGE)
        }
        assertThat(subscribeCaptor.firstValue.topicArn()).isEqualTo(TOPIC_ARN)
    }

    @Test
    fun `Subscribing to topic succeeds`() {
        val subscribeCaptor = argumentCaptor<SubscribeRequest>()
        snsClient.stub {
            on { subscribe(subscribeCaptor.capture()) } doReturn SubscribeResponse.builder().build()
        }

        runInEdtAndWait {
            SubscribeSnsDialog(projectRule.project, queue).subscribe(TOPIC_ARN)
        }
        assertThat(subscribeCaptor.firstValue.topicArn()).isEqualTo(TOPIC_ARN)
    }

    private companion object {
        const val TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:MyTopic"
        const val ERROR_MESSAGE = "Network Error"
    }
}
