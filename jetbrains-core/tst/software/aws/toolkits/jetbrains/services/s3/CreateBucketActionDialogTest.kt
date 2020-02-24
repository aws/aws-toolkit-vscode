// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.BucketAlreadyExistsException
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.CreateBucketResponse
import software.aws.toolkits.core.utils.delegateMock

class CreateBucketActionDialogTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val s3Mock = delegateMock<S3Client>()

    @Test
    fun validateBucketName_emptyBucketName() {
        runInEdtAndWait {
            val dialog = CreateS3BucketDialog(project = projectRule.project, s3Client = s3Mock)
            dialog.view.bucketName.text = "  "

            val validationInfo = dialog.validateBucketName()
            assertThat(validationInfo).isNotNull()
        }
    }

    @Test
    fun createBucketSuccessful() {
        val createBucketCaptor = argumentCaptor<CreateBucketRequest>()

        s3Mock.stub {
            on { createBucket(createBucketCaptor.capture()) } doReturn CreateBucketResponse.builder().build()
        }

        runInEdtAndWait {
            val dialog = CreateS3BucketDialog(
                project = projectRule.project,
                s3Client = s3Mock
            )
            dialog.view.bucketName.text = TEST_BUCKET_NAME

            dialog.createBucket()

            assertThat(dialog.bucketName()).isEqualTo(TEST_BUCKET_NAME)
        }

        assertThat(createBucketCaptor.firstValue.bucket()).isEqualTo(TEST_BUCKET_NAME)
    }

    @Test
    fun createBucketFailed() {
        val createBucketCaptor = argumentCaptor<CreateBucketRequest>()

        s3Mock.stub {
            on { createBucket(createBucketCaptor.capture()) } doThrow BucketAlreadyExistsException.builder().message(
                TEST_ERROR_MESSAGE
            ).build()
        }

        runInEdtAndWait {
            val dialog = CreateS3BucketDialog(project = projectRule.project, s3Client = s3Mock)
            dialog.view.bucketName.text = TEST_BUCKET_NAME

            assertThatThrownBy { dialog.createBucket() }.hasMessage(TEST_ERROR_MESSAGE)
        }

        assertThat(createBucketCaptor.firstValue.bucket()).isEqualTo(TEST_BUCKET_NAME)
    }

    companion object {
        const val TEST_BUCKET_NAME = "foo"
        const val TEST_ERROR_MESSAGE = "Bucket already exists!"
    }
}
