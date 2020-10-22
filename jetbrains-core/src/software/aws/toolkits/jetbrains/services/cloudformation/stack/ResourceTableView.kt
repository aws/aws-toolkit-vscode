// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.openapi.Disposable
import com.intellij.util.ui.JBUI
import software.amazon.awssdk.services.cloudformation.model.StackResource
import software.aws.toolkits.jetbrains.utils.ui.WrappingCellRenderer
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class ResourceTableView : View, ResourceListener, Disposable {
    private val table = DynamicTableView<StackResource>(
        DynamicTableView.Field(message("cloudformation.stack.logical_id")) { it.logicalResourceId() },
        DynamicTableView.Field(message("cloudformation.stack.physical_id")) { it.physicalResourceId() },
        DynamicTableView.Field(message("cloudformation.stack.type")) { it.resourceType() },
        DynamicTableView.Field(message("cloudformation.stack.status"), renderer = StatusCellRenderer()) { it.resourceStatusAsString() },
        DynamicTableView.Field(
            message("cloudformation.stack.reason"),
            renderer = WrappingCellRenderer(wrapOnSelection = true, wrapOnToggle = false)
        ) { it.resourceStatusReason() }
    ).apply { component.border = JBUI.Borders.empty() }

    override val component: JComponent = table.component

    override fun updatedResources(resources: List<StackResource>) = table.updateItems(resources, clearExisting = true)

    override fun dispose() {}
}

interface ResourceListener {
    fun updatedResources(resources: List<StackResource>)
}
