// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TestDialog
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse
import software.amazon.awssdk.services.s3.model.DeletedObject
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.objectActions.DeleteObjectAction
import software.aws.toolkits.jetbrains.utils.delegateMock
import java.time.Instant
import javax.swing.JButton
import javax.swing.JTextField

class DeleteObjectTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @Test
    fun deleteObjectsTest() {
        val s3Client = delegateMock<S3Client>()
        val deleteCaptor = argumentCaptor<DeleteObjectsRequest>()
        val mockFileSystem = S3VirtualFileSystem(s3Client)
        val mockTreeTable = delegateMock<S3TreeTable>()
        val mockButton = delegateMock<JButton>()
        val mockTextField = delegateMock<JTextField>()
        val mockVirtualBucket = S3VirtualBucket(mockFileSystem, S3Bucket("TestBucket", s3Client, Instant.parse("1995-10-23T10:12:35Z")))

        val mockDeleteObject = DeleteObjectAction(mockTreeTable, mockVirtualBucket, mockButton, mockTextField)

        val objectsToDelete = mutableListOf<ObjectIdentifier>()
        objectsToDelete.add(ObjectIdentifier.builder().key("testKey").build())

        s3Client.stub {
            on { deleteObjects(deleteCaptor.capture()) } doReturn
                    (DeleteObjectsResponse.builder()
                        .requestCharged("yes")
                        .deleted(listOf(DeletedObject.builder().deleteMarker(true).key("testKey").build()))).build()
            Messages.setTestDialog(TestDialog.OK)
        }
        mockClientManagerRule.manager().register(S3Client::class, s3Client)

        mockDeleteObject.deleteObjectAction(s3Client, objectsToDelete)
        val deleteRequest = deleteCaptor.firstValue
        Assertions.assertThat(deleteRequest.bucket()).isEqualTo("TestBucket")
        Assertions.assertThat(deleteRequest.delete().objects()[0].key()).isEqualTo("testKey")
    }
}