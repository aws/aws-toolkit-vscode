// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.progress.ProgressIndicator
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.atLeast
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.aws.toolkits.core.rules.S3TemporaryBucketRule

class ProgressMonitorInputStreamIntegrationTest {

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
    val bucketRule = S3TemporaryBucketRule(s3Client)

    val mock = mock<ProgressIndicator>()

    @Test
    fun canReportProgressUploadingToS3() {
        val size = 10000L
        val bucket = bucketRule.createBucket()
        val file = folder.newFile()
        file.writeBytes(ByteArray(size.toInt()))

        ProgressMonitorInputStream.fromFile(mock, file.toPath(), noOpReset = true).use { inputStream ->
            s3Client.putObject(PutObjectRequest.builder().bucket(bucket).key("someObj").build(), RequestBody.fromInputStream(inputStream, size))
        }

        verify(mock, atLeast(1)).fraction = any()
    }
}
