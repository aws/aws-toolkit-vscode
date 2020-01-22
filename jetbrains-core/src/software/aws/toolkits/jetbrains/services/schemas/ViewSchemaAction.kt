// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.resources.message

class ViewSchemaAction() : SingleResourceNodeAction<SchemaNode>(message("schemas.schema.view.action"), null, AwsIcons.Actions.SCHEMA_VIEW), DumbAware {
    override fun actionPerformed(selected: SchemaNode, e: AnActionEvent) {
        SchemaViewer(selected.nodeProject).downloadAndViewSchema(selected.value.name, selected.value.registryName)
    }
}
