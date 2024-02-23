// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.schemas.SchemaRegistryNode
import software.aws.toolkits.telemetry.SchemasTelemetry

class SearchSchemasAction : DumbAwareAction("Search Schemas", null, AwsIcons.Actions.SCHEMA_SEARCH) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        val dialog = SchemaSearchDialogManager.INSTANCE.searchAllRegistriesDialog(project)
        dialog.show()

        SchemasTelemetry.search(project, success = true)
    }
}

class SearchSchemasInRegistryAction :
    SingleResourceNodeAction<SchemaRegistryNode>("Search Schemas in Registry", null, AwsIcons.Actions.SCHEMA_SEARCH), DumbAware {
    override fun actionPerformed(selected: SchemaRegistryNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        val registry = selected.value.registryName()

        val dialog = SchemaSearchDialogManager.INSTANCE.searchRegistryDialog(registry, project)
        dialog.show()
    }
}
