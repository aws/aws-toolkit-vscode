// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.aws.toolkits.core.region.AwsRegion

class QueueTest {
    private val defaultRegion = AwsRegion("us-east-1", "US East (N. Virginia)", "aws")

    @Test
    fun `China region endpoint parsed`() {
        val queueRegion = AwsRegion("cn-northwest-1", "China (Ningxia)", "aws-cn")
        val queue = Queue("https://sqs.cn-northwest-1.amazonaws.com.cn/123456789012/test-1", queueRegion)

        assertThat(queue.arn).isEqualTo("arn:aws-cn:sqs:cn-northwest-1:123456789012:test-1")
        assertThat(queue.accountId).isEqualTo("123456789012")
        assertThat(queue.queueName).isEqualTo("test-1")
    }

    @Test
    fun `GovCloud region endpoint parsed`() {
        val queueRegion = AwsRegion("us-gov-east-1", "AWS GovCloud (US-East)", "aws-us-gov")
        val queue = Queue("https://sqs.us-gov-east-1.amazonaws.com/123456789012/test-2", queueRegion)

        assertThat(queue.arn).isEqualTo("arn:aws-us-gov:sqs:us-gov-east-1:123456789012:test-2")
        assertThat(queue.accountId).isEqualTo("123456789012")
        assertThat(queue.queueName).isEqualTo("test-2")
    }

    @Test
    fun `AWS region endpoint parsed`() {
        val queueRegion = AwsRegion("us-west-2", "US West (Oregon)", "aws")
        val queue = Queue("https://sqs.us-west-2.amazonaws.com/123456789012/test-_3", queueRegion)

        assertThat(queue.arn).isEqualTo("arn:aws:sqs:us-west-2:123456789012:test-_3")
        assertThat(queue.accountId).isEqualTo("123456789012")
        assertThat(queue.queueName).isEqualTo("test-_3")
    }

    @Test
    fun `Throws exception with non-url`() {
        assertThatThrownBy { Queue("Not a URL", defaultRegion) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `Throws exception with no name`() {
        assertThatThrownBy { Queue("https://sqs.us-east-1.amazonaws.com/123456789012/", defaultRegion) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `Throws exception with invalid account ID`() {
        assertThatThrownBy { Queue("https://sqs.us-east-1.amazonaws.com/123/test-4", defaultRegion) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `Throws exception with blank account ID`() {
        assertThatThrownBy {
            Queue(
                "https://sqs.us-east-1.amazonaws.com/            /test_a",
                defaultRegion
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }
}
