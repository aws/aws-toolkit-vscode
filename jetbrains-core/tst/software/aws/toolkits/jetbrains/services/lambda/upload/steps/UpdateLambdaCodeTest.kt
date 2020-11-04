// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.UpdateFunctionCodeRequest
import software.amazon.awssdk.services.lambda.model.UpdateFunctionCodeResponse
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationRequest
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationResponse
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UploadedCode
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
            UploadedCode(
                bucket = aString(),
                key = aString(),
                version = null
            )
        )
    }

    @Test
    fun `can update S3 code with version`() {
        validate(
            UploadedCode(
                bucket = aString(),
                key = aString(),
                version = aString()
            )
        )
    }

    @Test
    fun `can update the code and handler`() {
        validate(
            UploadedCode(
                bucket = aString(),
                key = aString(),
                version = null
            ),
            handler = aString()
        )
    }

    private fun validate(codeLocation: UploadedCode, handler: String? = null) {
        val codeRequestCaptor = argumentCaptor<UpdateFunctionCodeRequest>()
        val configRequestCaptor = argumentCaptor<UpdateFunctionConfigurationRequest>()
        val lambdaClient = clientManagerRule.create<LambdaClient>().stub {
            on { updateFunctionCode(codeRequestCaptor.capture()) } doReturn UpdateFunctionCodeResponse.builder().build()
            on { updateFunctionConfiguration(configRequestCaptor.capture()) } doReturn UpdateFunctionConfigurationResponse.builder().build()
        }
        val functionName = aString()

        val context = Context(projectRule.project)
        context.putAttribute(PackageLambda.UPLOADED_CODE_LOCATION, codeLocation)

        val functionDetails = handler?.let {
            FunctionDetails(
                name = functionName,
                handler = handler,
                iamRole = IamRole(aString()),
                runtime = Runtime.JAVA8,
                description = null,
                envVars = emptyMap(),
                timeout = 0,
                memorySize = 0,
                xrayEnabled = false
            )
        }

        UpdateLambdaCode(lambdaClient, functionName, functionDetails).run(context, ConsoleMessageEmitter("UpdateLambdaCode"))

        verify(lambdaClient).updateFunctionCode(any<UpdateFunctionCodeRequest>())
        with(codeRequestCaptor) {
            assertThat(allValues).hasSize(1)

            assertThat(firstValue.functionName()).isEqualTo(functionName)
            assertThat(firstValue.s3Bucket()).isEqualTo(codeLocation.bucket)
            assertThat(firstValue.s3Key()).isEqualTo(codeLocation.key)
            assertThat(firstValue.s3ObjectVersion()).isEqualTo(codeLocation.version)
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
