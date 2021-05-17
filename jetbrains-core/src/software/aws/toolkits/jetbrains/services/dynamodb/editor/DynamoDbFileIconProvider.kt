// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.ide.FileIconProvider
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import javax.swing.Icon

class DynamoDbFileIconProvider : FileIconProvider {
    override fun getIcon(file: VirtualFile, flags: Int, project: Project?): Icon? = if (file is DynamoDbVirtualFile) {
        AwsIcons.Resources.DynamoDb.TABLE
    } else {
        null
    }
}
