// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.awsClient

/**
 * Light virtual file to represent a dynamo table, used to open the custom editor
 */
class DynamoDbVirtualFile(val tableArn: String, val connectionSettings: ConnectionSettings) : LightVirtualFile(tableArn) {
    val dynamoDbClient: DynamoDbClient = connectionSettings.awsClient()
    val tableName = tableArn.substringAfterLast('/')

    /**
     * Override the presentable name so editor tabs only use table name
     */
    override fun getPresentableName(): String = tableName

    /**
     * Use the ARN as the path so editor tool tips can be differentiated
     */
    override fun getPath(): String = tableArn

    override fun isWritable(): Boolean = false

    /**
     * We use the ARN as the equality, so that we can show 2 tables from different accounts/regions with same name
     */
    override fun equals(other: Any?): Boolean {
        if (other !is DynamoDbVirtualFile) {
            return false
        }
        return this.tableArn == other.tableArn
    }

    override fun hashCode(): Int = tableArn.hashCode()
}
