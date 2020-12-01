// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.waitToLoad

class UpdateFunctionCodePanelTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    private lateinit var bucketName: String
    private lateinit var repository: Repository

    @Before
    fun wireMocksTogetherWithValidOptions() {
        val project = projectRule.project
        bucketName = aString()
        repository = Repository(aString(), "arn", aString())

        resourceCache.addEntry(
            project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            listOf(S3Resources.RegionalizedBucket(Bucket.builder().name(bucketName).build(), project.activeRegion()))
        )

        resourceCache.addEntry(
            project,
            EcrResources.LIST_REPOS,
            listOf(repository)
        )
    }

    @Test
    fun `valid panel returns null for Zip`() {
        val sut = createZipBasedCodePanel()
        assertThat(sut.validatePanel()).isNull()
    }

    @Test
    fun `source bucket must be selected if Zip based`() {
        val sut = createZipBasedCodePanel()
        runInEdtAndWait {
            sut.codeStorage.sourceBucket.selectedItem = null
            assertThat(sut.validatePanel()?.message).contains("Bucket must be specified")
        }
    }

    @Test
    fun `handler cannot be blank if Zip based`() {
        val sut = createZipBasedCodePanel()
        runInEdtAndWait {
            sut.handlerPanel.handler.text = ""
            assertThat(sut.validatePanel()?.message).contains("Handler must be specified")
        }
    }

    @Test
    fun `handler must be in project`() {
        val sut = createZipBasedCodePanel()
        runInEdtAndWait {
            sut.handlerPanel.handler.text = "Foo"
            assertThat(sut.validatePanel()?.message).contains("Must be able to locate the handler")
        }
    }

    @Test
    fun `valid panel returns null for Image`() {
        val sut = createImageBasedCodePanel()
        assertThat(sut.validatePanel()).isNull()
    }

    @Test
    fun `repo must be selected if Image based`() {
        val sut = createImageBasedCodePanel()
        runInEdtAndWait {
            sut.codeStorage.ecrRepo.selectedItem = null
            assertThat(sut.validatePanel()?.message).contains("Repository must be specified")
        }
    }

    @Test
    fun `dockerfile cannot be blank if Image based`() {
        val sut = createImageBasedCodePanel()
        runInEdtAndWait {
            sut.dockerFile.text = ""
            assertThat(sut.validatePanel()?.message).contains("Dockerfile not found")
        }
    }

    @Test
    fun `dockerfile must exist if Image based`() {
        val sut = createImageBasedCodePanel()
        runInEdtAndWait {
            sut.dockerFile.text = "iDontExist"
            assertThat(sut.validatePanel()?.message).contains("Dockerfile not found")
        }
    }

    @Test
    fun `dockerfile must be a file if Image based`() {
        val sut = createImageBasedCodePanel()
        runInEdtAndWait {
            sut.dockerFile.text = temporaryFolder.newFolder().absolutePath
            assertThat(sut.validatePanel()?.message).contains("Dockerfile not found")
        }
    }

    private fun createZipBasedCodePanel(): UpdateFunctionCodePanel {
        val panel = runInEdtAndGet {
            val sdk = IdeaTestUtil.getMockJdk18()
            runInEdtAndWait {
                runWriteAction {
                    ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                    ProjectRootManager.getInstance(projectRule.project).projectSdk = sdk
                }
            }

            projectRule.fixture.addClass(
                """
                package com.example;
    
                public class LambdaHandler {
                    public static void handleRequest(InputStream input, OutputStream output) { }
                }
                """
            )

            UpdateFunctionCodePanel(projectRule.project, PackageType.ZIP).apply {
                handlerPanel.setRuntime(Runtime.JAVA8)
                handlerPanel.handler.text = "com.example.LambdaHandler::handleRequest"
                codeStorage.sourceBucket.selectedItem = bucketName
            }
        }

        panel.codeStorage.sourceBucket.waitToLoad()

        return panel
    }

    private fun createImageBasedCodePanel(): UpdateFunctionCodePanel {
        val panel = runInEdtAndGet {
            UpdateFunctionCodePanel(projectRule.project, PackageType.IMAGE).apply {
                dockerFile.text = temporaryFolder.newFile().absolutePath
                codeStorage.ecrRepo.selectedItem = repository
            }
        }

        panel.codeStorage.ecrRepo.waitToLoad()

        return panel
    }
}
