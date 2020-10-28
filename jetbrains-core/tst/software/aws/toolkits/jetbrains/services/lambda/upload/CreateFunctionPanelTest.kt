// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.iam.IamResources
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass

class CreateFunctionPanelTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    private lateinit var sut: CreateFunctionPanel

    private val role = Role.builder()
        .arn(aString())
        .assumeRolePolicyDocument(LAMBDA_PRINCIPAL)
        .build()

    private val bucket = Bucket.builder().name(aString()).build()

    @Before
    fun wireMocksTogetherWithValidOptions() {
        val project = projectRule.project

        resourceCache.addEntry(
            project,
            IamResources.LIST_RAW_ROLES,
            listOf(role)
        )

        resourceCache.addEntry(
            project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            listOf(S3Resources.RegionalizedBucket(bucket, project.activeRegion()))
        )

        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(project).projectSdk = sdk
            }
            sut = CreateFunctionPanel(project)

            sut.name.text = "name"
            sut.description.text = "description"
            sut.configSettings.handlerPanel.handler.text = "com.example.LambdaHandler::handleRequest"
            sut.configSettings.runtime.selectedItem = Runtime.JAVA8
            sut.configSettings.timeoutSlider.value = 30
            sut.configSettings.memorySlider.value = 512
        }

        projectRule.fixture.openClass(
            """
            package com.example;
            public class LambdaHandler {
                public static void handleRequest(InputStream input, OutputStream output) { }
            }
            """
        )
    }

    @Test
    fun `valid function return nulls`() {
        assertThat(sut.validatePanel()).isNull()
    }

    @Test
    fun `name must be specified`() {
        sut.name.text = ""
        assertThat(sut.validatePanel()?.message).contains("Function Name must be specified")
    }

    @Test
    fun `function name has a valid length`() {
        sut.name.text = "aStringThatIsGreaterThanSixtyFourCharactersInLengthAndIsThereforeInvalid"
        assertThat(sut.validatePanel()?.message).contains("must not exceed 64 characters")
    }

    @Test
    fun `function name must be alpha numeric`() {
        sut.name.text = "a string"
        assertThat(sut.validatePanel()?.message).contains("alphanumerics")
    }
}
