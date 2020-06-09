// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.openapi.Disposable
import software.amazon.awssdk.services.cloudformation.model.Output
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class OutputsTableView : View, OutputsListener, Disposable {
    private val table = DynamicTableView<Output>(
        DynamicTableView.Field(message("cloudformation.stack.outputs.key")) { it.outputKey() },
        DynamicTableView.Field(message("cloudformation.stack.outputs.value")) { it.outputValue() },
        DynamicTableView.Field(message("cloudformation.stack.outputs.description")) { it.description() },
        DynamicTableView.Field(message("cloudformation.stack.outputs.export")) { it.exportName() }
    )

    override val component: JComponent = table.component

    override fun updatedOutputs(outputs: List<Output>) = table.updateItems(outputs.sortedBy { it.outputKey() }, clearExisting = true)

    override fun dispose() {}
}

interface OutputsListener {
    fun updatedOutputs(outputs: List<Output>)
}
