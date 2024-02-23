// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.testFramework.runInEdtAndWait
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.Output

class OutputsTableViewTest {

    @Test
    fun `output response is mapped to table correctly`() {
        val output = Output.builder().outputKey("key").outputValue("value").description("description").exportName("export").build()

        val sut = OutputsTableView()

        runInEdtAndWait {
            sut.updatedOutputs(listOf(output))
        }

        with((sut.component as JBScrollPane).viewport.view as JBTable) {
            assertThat(model.rowCount).isEqualTo(1)
            assertThat(model.getValueAt(0, 0)).isEqualTo("key")
            assertThat(model.getValueAt(0, 1)).isEqualTo("value")
            assertThat(model.getValueAt(0, 2)).isEqualTo("description")
            assertThat(model.getValueAt(0, 3)).isEqualTo("export")
        }
    }
}
