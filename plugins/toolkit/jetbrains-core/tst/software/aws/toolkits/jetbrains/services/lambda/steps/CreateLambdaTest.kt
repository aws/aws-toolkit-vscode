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
import org.mockito.kotlin.verify
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionRequest
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationRequest
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationResponse
import software.amazon.awssdk.services.lambda.model.GetFunctionRequest
import software.amazon.awssdk.services.lambda.model.GetFunctionResponse
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.State
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.steps.CreateLambda.Companion.FUNCTION_ARN
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.utils.execution.steps.ConsoleMessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Context

class CreateLambdaTest {
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
            ),
            FunctionDetails(
                name = aString(),
                description = aString(),
                packageType = PackageType.ZIP,
                runtime = Runtime.knownValues().random(),
                handler = aString(),
                iamRole = IamRole(aString()),
                envVars = mapOf(aString() to aString()),
                timeout = 300,
                memorySize = 1024,
                xrayEnabled = true
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
            ),
            FunctionDetails(
                name = aString(),
                description = aString(),
                packageType = PackageType.ZIP,
                runtime = Runtime.knownValues().random(),
                handler = aString(),
                iamRole = IamRole(aString()),
                envVars = mapOf(aString() to aString()),
                timeout = 300,
                memorySize = 1024,
                xrayEnabled = false
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
            FunctionDetails(
                name = aString(),
                description = aString(),
                packageType = PackageType.ZIP,
                runtime = Runtime.knownValues().random(),
                handler = aString(),
                iamRole = IamRole(aString()),
                envVars = mapOf(aString() to aString()),
                timeout = 300,
                memorySize = 1024,
                xrayEnabled = true
            )
        )
    }

    @Test
    fun `can update the code from ecr`() {
        validate(
            UploadedEcrCode(
                imageUri = aString()
            ),
            FunctionDetails(
                name = aString(),
                description = aString(),
                packageType = PackageType.IMAGE,
                runtime = null,
                handler = null,
                iamRole = IamRole(aString()),
                envVars = mapOf(aString() to aString()),
                timeout = 300,
                memorySize = 1024,
                xrayEnabled = true
            )
        )
    }

    private fun validate(codeLocation: UploadedCode, details: FunctionDetails) {
        val requestCaptor = argumentCaptor<CreateFunctionRequest>()
        val lambdaClient = clientManagerRule.create<LambdaClient>().stub {
            on { createFunction(requestCaptor.capture()) } doReturn CreateFunctionResponse.builder().functionArn("arn of ${details.name}").build()
            on { getFunction(any<GetFunctionRequest>()) } doReturn with(GetFunctionResponse.builder()) {
                configuration { it.functionArn("arn of ${details.name}") }
                sdkHttpResponse(SdkHttpResponse.builder().statusCode(200).build()) // waiters validate the status code
                build()
            }
            on { getFunctionConfiguration(any<GetFunctionConfigurationRequest>()) } doReturn with(GetFunctionConfigurationResponse.builder()) {
                functionArn("arn of ${details.name}")
                state(State.ACTIVE)
                sdkHttpResponse(SdkHttpResponse.builder().statusCode(200).build()) // waiters validate the status code
                build()
            }
        }

        val context = Context()
        context.putAttribute(PackageLambda.UPLOADED_CODE_LOCATION, codeLocation)

        CreateLambda(lambdaClient, details).run(context, ConsoleMessageEmitter("CreateLambda"))

        verify(lambdaClient).createFunction(any<CreateFunctionRequest>())
        with(requestCaptor) {
            assertThat(allValues).hasSize(1)

            assertThat(firstValue.functionName()).isEqualTo(details.name)
            assertThat(firstValue.description()).isEqualTo(details.description)
            assertThat(firstValue.environment().variables()).isEqualTo(details.envVars)
            assertThat(firstValue.handler()).isEqualTo(details.handler)
            assertThat(firstValue.runtime()).isEqualTo(details.runtime)
            assertThat(firstValue.role()).isEqualTo(details.iamRole.arn)
            assertThat(firstValue.memorySize()).isEqualTo(details.memorySize)
            assertThat(firstValue.timeout()).isEqualTo(details.timeout)
            assertThat(firstValue.tracingConfig().mode()).isEqualTo(details.tracingMode)

            when (codeLocation) {
                is UploadedS3Code -> {
                    assertThat(firstValue.code().s3Bucket()).isEqualTo(codeLocation.bucket)
                    assertThat(firstValue.code().s3Key()).isEqualTo(codeLocation.key)
                    assertThat(firstValue.code().s3ObjectVersion()).isEqualTo(codeLocation.version)
                }
                is UploadedEcrCode -> {
                    assertThat(firstValue.code().imageUri()).isEqualTo(codeLocation.imageUri)
                }
            }
        }

        assertThat(context.getAttribute(FUNCTION_ARN)).isEqualTo("arn of ${details.name}")
    }
}
