// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAware
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.schemas.SchemaNode
import software.aws.toolkits.resources.message

class DownloadCodeForSchemaAction :
    SingleResourceNodeAction<SchemaNode>(message("schemas.schema.download_code_bindings.action"), null, AwsIcons.Actions.SCHEMA_CODE_GEN), DumbAware {
    override fun actionPerformed(selected: SchemaNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        val schema = selected.value

        DownloadCodeForSchemaDialog(project, schema).show()
    }
}
