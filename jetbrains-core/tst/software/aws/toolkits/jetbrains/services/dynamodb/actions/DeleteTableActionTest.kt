// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.actions

import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.DeleteTableRequest
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.dynamodb.editor.DynamoDbTableEditorProvider
import software.aws.toolkits.jetbrains.services.dynamodb.explorer.DynamoDbTableNode
import software.aws.toolkits.jetbrains.utils.associateFilePattern

class DeleteTableActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @Test
    fun deleteTable() {
        val tableName = aString()
        val dynamoDbClient = mockClientManager.create<DynamoDbClient>()
        val tableNode = DynamoDbTableNode(projectRule.project, tableName)

        val deleteBucketAction = DeleteTableAction()
        deleteBucketAction.performDelete(tableNode)

        argumentCaptor<DeleteTableRequest>().apply {
            verify(dynamoDbClient).deleteTable(capture())

            assertThat(firstValue.tableName()).isEqualTo(tableName)
        }
    }

    @Test
    fun deleteTableClosesEditors() {
        val tableName = aString()
        val tableNode = DynamoDbTableNode(projectRule.project, tableName)
        mockClientManager.create<DynamoDbClient>()

        val fileEditorManager = FileEditorManagerEx.getInstanceEx(projectRule.project)

        runInEdtAndWait {
            // Silly hack because test file editor impl has a bunch of asserts about the document/psi that don't exist in the real impl
            associateFilePattern(FileTypes.PLAIN_TEXT, tableNode.resourceArn(), disposableRule.disposable)

            assertThat(fileEditorManager.openFiles).isEmpty()
            DynamoDbTableEditorProvider.openViewer(projectRule.project, tableNode.resourceArn())
            assertThat(fileEditorManager.openFiles).isNotEmpty
        }

        val deleteBucketAction = DeleteTableAction()
        deleteBucketAction.performDelete(tableNode)

        assertThat(fileEditorManager.openFiles).isEmpty()
    }
}
