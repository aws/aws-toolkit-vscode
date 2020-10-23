// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass
import software.aws.toolkits.jetbrains.utils.waitToLoad

class UpdateLambdaCodePanelTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    private lateinit var sut: UpdateFunctionCodePanel

    @Before
    fun wireMocksTogetherWithValidOptions() {
        val project = projectRule.project
        val bucketName = "sourceBucket"

        resourceCache.addEntry(
            project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            listOf(S3Resources.RegionalizedBucket(Bucket.builder().name(bucketName).build(), project.activeRegion()))
        )

        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(project).projectSdk = sdk
            }
            sut = UpdateFunctionCodePanel(project)
            sut.handlerPanel.setRuntime(Runtime.JAVA8)
            sut.handlerPanel.handler.text = "com.example.LambdaHandler::handleRequest"
            sut.codeStorage.sourceBucket.selectedItem = bucketName
        }

        projectRule.fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public static void handleRequest(InputStream input, OutputStream output) { }
            }
            """
        )

        sut.codeStorage.sourceBucket.waitToLoad()
    }

    @Test
    fun validFunctionReturnsNull() {
        runInEdtAndWait {
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun sourceBucketMustBeSelectedToDeploy() {
        runInEdtAndWait {
            sut.codeStorage.sourceBucket.selectedItem = null
            assertThat(sut.validatePanel()?.message).contains("Bucket must be specified")
        }
    }

    @Test
    fun handlerCannotBeBlank() {
        runInEdtAndWait {
            sut.handlerPanel.handler.text = ""
            assertThat(sut.validatePanel()?.message).contains("Handler must be specified")
        }
    }

    @Test
    fun handlerMustBeInProjectToDeploy() {
        runInEdtAndWait {
            sut.handlerPanel.handler.text = "Foo"
            assertThat(sut.validatePanel()?.message).contains("Must be able to locate the handler")
        }
    }
}
