// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationRequest
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationResponse
import software.amazon.awssdk.services.lambda.model.LastUpdateStatus
import software.amazon.awssdk.services.lambda.model.State
import software.amazon.awssdk.services.lambda.model.UpdateFunctionCodeRequest
import software.amazon.awssdk.services.lambda.model.UpdateFunctionCodeResponse
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationRequest
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationResponse
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.utils.execution.steps.ConsoleMessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Context

class UpdateLambdaCodeTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val clientManagerRule = MockClientManagerRule()

    @Test
    fun `can update S3 code`() {
        validate(
            UploadedS3Code(
                bucket = aString(),
                key = aString(),
                version = null
            )
        )
    }

    @Test
    fun `can update S3 code with version`() {
        validate(
            UploadedS3Code(
                bucket = aString(),
                key = aString(),
                version = aString()
            )
        )
    }

    @Test
    fun `can update the code and handler`() {
        validate(
            UploadedS3Code(
                bucket = aString(),
                key = aString(),
                version = null
            ),
            handler = aString()
        )
    }

    @Test
    fun `can update image based code`() {
        validate(
            UploadedEcrCode(
                imageUri = aString()
            )
        )
    }

    private fun validate(codeLocation: UploadedCode, handler: String? = null) {
        val codeRequestCaptor = argumentCaptor<UpdateFunctionCodeRequest>()
        val configRequestCaptor = argumentCaptor<UpdateFunctionConfigurationRequest>()
        val lambdaClient = clientManagerRule.create<LambdaClient>().stub {
            on { updateFunctionCode(codeRequestCaptor.capture()) } doReturn UpdateFunctionCodeResponse.builder().build()
            on { updateFunctionConfiguration(configRequestCaptor.capture()) } doReturn UpdateFunctionConfigurationResponse.builder().build()
            on { getFunctionConfiguration(any<GetFunctionConfigurationRequest>()) } doReturn GetFunctionConfigurationResponse.builder()
                .state(State.ACTIVE)
                .lastUpdateStatus(LastUpdateStatus.SUCCESSFUL)
                .build()
        }
        val functionName = aString()

        val context = Context()
        context.putAttribute(PackageLambda.UPLOADED_CODE_LOCATION, codeLocation)

        UpdateLambdaCode(lambdaClient, functionName, handler).run(context, ConsoleMessageEmitter("UpdateLambdaCode"))

        verify(lambdaClient).updateFunctionCode(any<UpdateFunctionCodeRequest>())
        with(codeRequestCaptor) {
            assertThat(allValues).hasSize(1)

            assertThat(firstValue.functionName()).isEqualTo(functionName)

            when (codeLocation) {
                is UploadedS3Code -> {
                    assertThat(firstValue.s3Bucket()).isEqualTo(codeLocation.bucket)
                    assertThat(firstValue.s3Key()).isEqualTo(codeLocation.key)
                    assertThat(firstValue.s3ObjectVersion()).isEqualTo(codeLocation.version)
                }
                is UploadedEcrCode -> {
                    assertThat(firstValue.imageUri()).isEqualTo(codeLocation.imageUri)
                }
            }
        }

        if (handler == null) {
            verify(lambdaClient, times(0)).updateFunctionConfiguration(any<UpdateFunctionConfigurationRequest>())
        } else {
            verify(lambdaClient).updateFunctionConfiguration(any<UpdateFunctionConfigurationRequest>())
            with(configRequestCaptor) {
                assertThat(allValues).hasSize(1)

                assertThat(firstValue.functionName()).isEqualTo(functionName)
                assertThat(firstValue.handler()).isEqualTo(handler)
            }
        }
    }
}
