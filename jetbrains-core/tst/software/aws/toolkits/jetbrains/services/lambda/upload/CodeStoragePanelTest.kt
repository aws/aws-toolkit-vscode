// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.waitToLoad

class CodeStoragePanelTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @JvmField
    @Rule
    val mockResourceCache = MockResourceCacheRule()

    private lateinit var bucketName: String
    private lateinit var repository: Repository

    @Before
    fun setUp() {
        bucketName = aString()
        repository = Repository(aString(), "arn", aString())

        val region = projectRule.project.activeRegion()

        mockResourceCache.addEntry(
            projectRule.project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            listOf(S3Resources.RegionalizedBucket(Bucket.builder().name(bucketName).build(), region))
        )

        mockResourceCache.addEntry(
            projectRule.project,
            EcrResources.LIST_REPOS,
            listOf(repository)
        )
    }

    @Test
    fun `valid code storage for Zip returns null`() {
        val sut = createZipBasedCodeStorage()
        runInEdtAndWait {
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `code location for Zip returns bucket`() {
        val sut = createZipBasedCodeStorage()
        runInEdtAndWait {
            assertThat(sut.codeLocation()).isEqualTo(bucketName)
        }
    }

    @Test
    fun `bucket must be specified for Zip`() {
        val sut = createZipBasedCodeStorage()
        runInEdtAndWait {
            sut.sourceBucket.selectedItem = null
            assertThat(sut.validatePanel()?.message).contains("Bucket must be specified")
        }
    }

    @Test
    fun `valid code storage for Image returns null`() {
        val sut = createImageBasedCodeStorage()
        runInEdtAndWait {
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `code location for Image returns repo`() {
        val sut = createImageBasedCodeStorage()
        runInEdtAndWait {
            assertThat(sut.codeLocation()).isEqualTo(repository.repositoryUri)
        }
    }

    @Test
    fun `repo must be specified for Image`() {
        val sut = createImageBasedCodeStorage()
        runInEdtAndWait {
            sut.ecrRepo.selectedItem = null
            assertThat(sut.validatePanel()?.message).contains("Repository must be specified")
        }
    }

    private fun createZipBasedCodeStorage(): CodeStoragePanel {
        val panel = runInEdtAndGet {
            CodeStoragePanel(projectRule.project).apply {
                packagingType = PackageType.ZIP
                sourceBucket.selectedItem = bucketName
            }
        }

        panel.sourceBucket.waitToLoad()

        return panel
    }

    private fun createImageBasedCodeStorage(): CodeStoragePanel {
        val panel = runInEdtAndGet {
            CodeStoragePanel(projectRule.project).apply {
                packagingType = PackageType.IMAGE
                ecrRepo.selectedItem = repository
            }
        }

        panel.ecrRepo.waitToLoad()

        return panel
    }
}
