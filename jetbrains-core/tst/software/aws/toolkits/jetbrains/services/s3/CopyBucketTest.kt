// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.bucketActions.CopyBucketNameAction
import java.awt.datatransfer.DataFlavor

class CopyBucketTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @Test
    fun copyBucketName() {
        val s3Mock = delegateMock<S3Client>()
        mockClientManagerRule.manager().register(S3Client::class, s3Mock)

        val bucket = S3BucketNode(projectRule.project, Bucket.builder().name("foo").build())
        val copyAction = CopyBucketNameAction()
        copyAction.actionPerformed(bucket, TestActionEvent(DataContext { projectRule.project }))
        val content = CopyPasteManager.getInstance().contents
        Assertions.assertThat(content?.getTransferData(DataFlavor.stringFlavor)).isEqualTo("foo")
    }
}
