// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.actions

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.dynamodb.DynamoDbResources
import software.aws.toolkits.jetbrains.services.dynamodb.editor.DynamoDbVirtualFile
import software.aws.toolkits.jetbrains.services.dynamodb.explorer.DynamoDbTableNode

class DeleteTableAction : DeleteResourceAction<DynamoDbTableNode>() {
    override fun performDelete(selected: DynamoDbTableNode) {
        val project = selected.nodeProject
        val client = project.awsClient<DynamoDbClient>()

        val fileEditorManager = FileEditorManager.getInstance(selected.nodeProject)
        fileEditorManager.openFiles.forEach {
            if (it is DynamoDbVirtualFile && it.tableArn == selected.resourceArn()) {
                // Wait so that we know it closes successfully, otherwise this operation is not a success
                ApplicationManager.getApplication().invokeAndWait {
                    fileEditorManager.closeFile(it)
                }
            }
        }

        client.deleteTable { it.tableName(selected.displayName()) }
        project.refreshAwsTree(DynamoDbResources.LIST_TABLES)
    }
}
