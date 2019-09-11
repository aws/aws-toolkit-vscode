// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.util.io.FileUtil
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionRequest
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.EnvironmentResponse
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.UpdateFunctionCodeRequest
import software.amazon.awssdk.services.lambda.model.UpdateFunctionCodeResponse
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationRequest
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationResponse
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.utils.delegateMock
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import java.nio.file.Path
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

abstract class LambdaCreatorTestBase(private val functionDetails: FunctionUploadDetails) {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule { projectRule.project }

    @Test
    fun testCreation() {
        val s3Bucket = "TestBucket"

        val uploadCaptor = argumentCaptor<PutObjectRequest>()
        mockClientManager.create<S3Client>().stub {
            on { putObject(uploadCaptor.capture(), any<Path>()) } doReturn PutObjectResponse.builder()
                .versionId("VersionFoo")
                .build()
        }

        val createCaptor = argumentCaptor<CreateFunctionRequest>()
        mockClientManager.create<LambdaClient>().stub {
            on { createFunction(createCaptor.capture()) } doReturn CreateFunctionResponse.builder()
                .functionName(functionDetails.name)
                .functionArn("TestFunctionArn")
                .description(functionDetails.description)
                .lastModified(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                .handler(functionDetails.handler)
                .runtime(functionDetails.runtime)
                .timeout(functionDetails.timeout)
                .memorySize(functionDetails.memorySize)
                .environment(EnvironmentResponse.builder().variables(functionDetails.envVars).build())
                .tracingConfig {
                    it.mode(functionDetails.tracingMode)
                }
                .role(functionDetails.iamRole.arn)
                .build()
        }

        val tempFile = FileUtil.createTempFile("lambda", ".zip")

        val lambdaBuilder = mock<LambdaBuilder> {
            on { packageLambda(any(), any(), any(), any(), any(), any()) } doReturn tempFile.toPath()
        }

        val psiFile = projectRule.fixture.addClass(
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        val lambdaCreator = LambdaCreatorFactory.create(mockClientManager.manager(), lambdaBuilder)
        lambdaCreator.createLambda(projectRule.module, psiFile, functionDetails, s3Bucket).toCompletableFuture()
            .get(5, TimeUnit.SECONDS)

        val uploadRequest = uploadCaptor.firstValue
        assertThat(uploadRequest.bucket()).isEqualTo(s3Bucket)
        assertThat(uploadRequest.key()).isEqualTo("${functionDetails.name}.zip")

        val createRequest = createCaptor.firstValue
        assertThat(createRequest.functionName()).isEqualTo(functionDetails.name)
        assertThat(createRequest.description()).isEqualTo(functionDetails.description)
        assertThat(createRequest.handler()).isEqualTo(functionDetails.handler)
        assertThat(createRequest.environment().variables()).isEqualTo(functionDetails.envVars)
        assertThat(createRequest.role()).isEqualTo(functionDetails.iamRole.arn)
        assertThat(createRequest.runtime()).isEqualTo(functionDetails.runtime)
        assertThat(createRequest.timeout()).isEqualTo(functionDetails.timeout)
        assertThat(createRequest.memorySize()).isEqualTo(functionDetails.memorySize)
        assertThat(createRequest.tracingConfig().mode()).isEqualTo(functionDetails.tracingMode)
        assertThat(createRequest.code().s3Bucket()).isEqualTo(s3Bucket)
        assertThat(createRequest.code().s3Key()).isEqualTo("${functionDetails.name}.zip")
        assertThat(createRequest.code().s3ObjectVersion()).isEqualTo("VersionFoo")
    }

    @Test
    fun testUpdateCodeAndSettings() {
        val s3Bucket = "TestBucket"

        val uploadCaptor = argumentCaptor<PutObjectRequest>()
        mockClientManager.create<S3Client>().stub {
            on { putObject(uploadCaptor.capture(), any<Path>()) } doReturn PutObjectResponse.builder()
                .versionId("VersionFoo")
                .build()
        }

        val updateConfigCaptor = argumentCaptor<UpdateFunctionConfigurationRequest>()
        val updateCodeCaptor = argumentCaptor<UpdateFunctionCodeRequest>()
        mockClientManager.create<LambdaClient>().stub {
            on { updateFunctionCode(updateCodeCaptor.capture()) } doReturn UpdateFunctionCodeResponse.builder()
                .build()

            on { updateFunctionConfiguration(updateConfigCaptor.capture()) } doReturn UpdateFunctionConfigurationResponse.builder()
                .functionName(functionDetails.name)
                .functionArn("TestFunctionArn")
                .description(functionDetails.description)
                .lastModified(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                .handler(functionDetails.handler)
                .runtime(functionDetails.runtime)
                .timeout(functionDetails.timeout)
                .memorySize(functionDetails.memorySize)
                .environment(EnvironmentResponse.builder().variables(functionDetails.envVars).build())
                .tracingConfig(TracingConfigResponse.builder().mode(functionDetails.tracingMode).build())
                .role(functionDetails.iamRole.arn)
                .build()
        }

        val tempFile = FileUtil.createTempFile("lambda", ".zip")

        val lambdaBuilder = mock<LambdaBuilder> {
            on { packageLambda(any(), any(), any(), any(), any(), any()) } doReturn tempFile.toPath()
        }

        val psiFile = projectRule.fixture.addClass(
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        val lambdaCreator = LambdaCreatorFactory.create(mockClientManager.manager(), lambdaBuilder)
        lambdaCreator.updateLambda(projectRule.module, psiFile, functionDetails, s3Bucket).toCompletableFuture()
            .get(5, TimeUnit.SECONDS)

        val uploadRequest = uploadCaptor.firstValue
        assertThat(uploadRequest.bucket()).isEqualTo(s3Bucket)
        assertThat(uploadRequest.key()).isEqualTo("${functionDetails.name}.zip")

        val configurationRequest = updateConfigCaptor.firstValue
        assertConfigurationRequestMatchesFunctionDetails(configurationRequest)

        val codeRequest = updateCodeCaptor.firstValue
        assertThat(codeRequest.s3Bucket()).isEqualTo(s3Bucket)
        assertThat(codeRequest.s3Key()).isEqualTo("${functionDetails.name}.zip")
        assertThat(codeRequest.s3ObjectVersion()).isEqualTo("VersionFoo")
    }

    @Test
    fun testUpdateSettings() {
        val updateConfigCaptor = argumentCaptor<UpdateFunctionConfigurationRequest>()
        val lambdaClient = delegateMock<LambdaClient> {
            on { updateFunctionConfiguration(updateConfigCaptor.capture()) } doReturn UpdateFunctionConfigurationResponse.builder()
                .functionName(functionDetails.name)
                .functionArn("TestFunctionArn")
                .description(functionDetails.description)
                .lastModified(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                .handler(functionDetails.handler)
                .runtime(functionDetails.runtime)
                .timeout(functionDetails.timeout)
                .memorySize(functionDetails.memorySize)
                .environment(EnvironmentResponse.builder().variables(functionDetails.envVars).build())
                .tracingConfig(TracingConfigResponse.builder().mode(functionDetails.tracingMode).build())
                .role(functionDetails.iamRole.arn)
                .build()
        }

        val lambdaCreator = LambdaFunctionCreator((lambdaClient))
        lambdaCreator.update(functionDetails).toCompletableFuture().get(5, TimeUnit.SECONDS)

        val configurationRequest = updateConfigCaptor.firstValue
        assertConfigurationRequestMatchesFunctionDetails(configurationRequest)
    }

    private fun assertConfigurationRequestMatchesFunctionDetails(configurationRequest: UpdateFunctionConfigurationRequest) {
        assertThat(configurationRequest.functionName()).isEqualTo(functionDetails.name)
        assertThat(configurationRequest.description()).isEqualTo(functionDetails.description)
        assertThat(configurationRequest.handler()).isEqualTo(functionDetails.handler)
        assertThat(configurationRequest.environment().variables()).isEqualTo(functionDetails.envVars)
        assertThat(configurationRequest.role()).isEqualTo(functionDetails.iamRole.arn)
        assertThat(configurationRequest.runtime()).isEqualTo(functionDetails.runtime)
        assertThat(configurationRequest.timeout()).isEqualTo(functionDetails.timeout)
        assertThat(configurationRequest.memorySize()).isEqualTo(functionDetails.memorySize)
        assertThat(configurationRequest.tracingConfig().mode()).isEqualTo(functionDetails.tracingMode)
    }
}

class LambdaCreatorTestWithoutXray : LambdaCreatorTestBase(
    FunctionUploadDetails(
        name = "TestFunction",
        handler = "com.example.UsefulUtils::upperCase",
        iamRole = IamRole("TestRoleArn"),
        runtime = Runtime.JAVA8,
        description = "TestDescription",
        envVars = mapOf("TestKey" to "TestValue"),
        timeout = 60,
        memorySize = 512,
        xrayEnabled = false
    )
)

class LambdaCreatorTestWithXray : LambdaCreatorTestBase(
    FunctionUploadDetails(
        name = "TestFunction",
        handler = "com.example.UsefulUtils::upperCase",
        iamRole = IamRole("TestRoleArn"),
        runtime = Runtime.JAVA8,
        description = "TestDescription",
        envVars = mapOf("TestKey" to "TestValue"),
        timeout = 60,
        memorySize = 512,
        xrayEnabled = true
    )
)
