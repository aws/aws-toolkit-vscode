// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.rules.S3TemporaryBucketRule
import software.aws.toolkits.jetbrains.utils.value

class TransferUtilsIntegrationTest {
    private val s3Client = S3Client.builder()
        .httpClient(ApacheHttpClient.builder().build())
        .region(Region.US_WEST_2)
        .serviceConfiguration { it.pathStyleAccessEnabled(true) }
        .build()

    @JvmField
    @Rule
    val folder = TemporaryFolder()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val bucketRule = S3TemporaryBucketRule(s3Client)

    @Test
    fun canDoUploadAndDownload() {
        val bucket = bucketRule.createBucket()
        val bigString = "hello world".repeat(1000)

        val sourceFile = folder.newFile()
        sourceFile.writeText(bigString)

        s3Client.upload(projectRule.project, sourceFile.toPath(), bucket, "file", message = "uploading").value

        val destinationFile = folder.newFile()
        s3Client.download(projectRule.project, bucket, "file", destinationFile.toPath(), message = "downloading").value

        assertThat(destinationFile).hasSameTextualContentAs(sourceFile)
    }
}
