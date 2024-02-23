// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateEventSourceMappingRequest
import software.amazon.awssdk.services.lambda.model.CreateEventSourceMappingResponse
import software.amazon.awssdk.services.lambda.model.InvalidParameterValueException
import software.amazon.awssdk.services.lambda.model.ResourceConflictException
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion

class ConfigureLambdaDialogTest {
    lateinit var sqsClient: SqsClient
    lateinit var lambdaClient: LambdaClient
    lateinit var iamClient: IamClient
    lateinit var region: AwsRegion
    lateinit var queue: Queue

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @Before
    fun setup() {
        sqsClient = mockClientManagerRule.create()
        lambdaClient = mockClientManagerRule.create()
        iamClient = mockClientManagerRule.create()
        queue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/test", getDefaultRegion())
    }

    @Test
    fun `No function selected`() {
        runInEdtAndWait {
            val dialog = ConfigureLambdaDialog(projectRule.project, queue)
            val validationInfo = dialog.validate()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun `Function configuration succeeds`() {
        val configureCaptor = argumentCaptor<CreateEventSourceMappingRequest>()
        lambdaClient.stub {
            on { createEventSourceMapping(configureCaptor.capture()) } doReturn CreateEventSourceMappingResponse.builder().build()
        }

        runInEdtAndWait {
            ConfigureLambdaDialog(projectRule.project, queue).apply {
                configureLambda(TEST_FUNCTION_NAME)
            }
        }
        assertThat(configureCaptor.firstValue.functionName()).isEqualTo(TEST_FUNCTION_NAME)
        assertThat(configureCaptor.firstValue.eventSourceArn()).isEqualTo(queue.arn)
    }

    @Test
    fun `Error configuring function`() {
        val configureCaptor = argumentCaptor<CreateEventSourceMappingRequest>()
        lambdaClient.stub {
            on { createEventSourceMapping(configureCaptor.capture()) } doThrow InvalidParameterValueException.builder().message(ERROR_MESSAGE).build()
        }

        runInEdtAndWait {
            val dialog = ConfigureLambdaDialog(projectRule.project, queue)
            assertThatThrownBy { dialog.configureLambda(TEST_FUNCTION_NAME) }.hasMessage(ERROR_MESSAGE)
        }
        assertThat(configureCaptor.firstValue.functionName()).isEqualTo(TEST_FUNCTION_NAME)
        assertThat(configureCaptor.firstValue.eventSourceArn()).isEqualTo(queue.arn)
    }

    @Test
    fun `Error configuring after policy added`() {
        val configureCaptor = argumentCaptor<CreateEventSourceMappingRequest>()
        lambdaClient.stub {
            on { createEventSourceMapping(configureCaptor.capture()) } doThrow ResourceConflictException.builder().message(ERROR_MESSAGE).build()
        }

        runInEdtAndWait {
            val dialog = ConfigureLambdaDialog(projectRule.project, queue)
            runBlocking {
                val identifier = dialog.waitUntilConfigured(TEST_FUNCTION_NAME)
                assertThat(identifier).isNull()
            }
        }
        assertThat(configureCaptor.firstValue.functionName()).isEqualTo(TEST_FUNCTION_NAME)
        assertThat(configureCaptor.firstValue.eventSourceArn()).isEqualTo(queue.arn)
    }

    @Test
    fun `Success configuring after policy added`() {
        val configureCaptor = argumentCaptor<CreateEventSourceMappingRequest>()
        lambdaClient.stub {
            on { createEventSourceMapping(configureCaptor.capture()) } doReturn
                CreateEventSourceMappingResponse.builder().eventSourceArn(queue.arn).uuid(EVENT_IDENTIFIER).build()
        }

        runInEdtAndWait {
            val dialog = ConfigureLambdaDialog(projectRule.project, queue)
            runBlocking {
                val identifier = dialog.waitUntilConfigured(TEST_FUNCTION_NAME)
                assertThat(identifier).isEqualTo(EVENT_IDENTIFIER)
            }
        }
        assertThat(configureCaptor.firstValue.functionName()).isEqualTo(TEST_FUNCTION_NAME)
        assertThat(configureCaptor.firstValue.eventSourceArn()).isEqualTo(queue.arn)
    }

    private companion object {
        const val TEST_FUNCTION_NAME = "Function"
        const val EVENT_IDENTIFIER = "abc"
        const val ERROR_MESSAGE = "Function has invalid permission"
    }
}
