// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.testFramework.runInEdtAndWait
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.StackEvent
import java.time.Instant

class EventsTableTest {

    @Test
    fun `StackEvents are mapped to the table columns as expected`() {
        val now = Instant.now()
        val event = StackEvent.builder()
            .timestamp(now)
            .resourceStatus(ResourceStatus.CREATE_COMPLETE)
            .logicalResourceId("logical")
            .physicalResourceId("physical")
            .resourceStatusReason("reasons")
            .build()

        val sut = EventsTableImpl()

        runInEdtAndWait {
            sut.insertEvents(listOf(event), pageChanged = false)
        }

        with((sut.component as JBScrollPane).viewport.view as JBTable) {
            assertThat(model.rowCount).isEqualTo(1)
            assertThat(model.getValueAt(0, 0)).isEqualTo(now)
            assertThat(model.getValueAt(0, 1)).isEqualTo("CREATE_COMPLETE")
            assertThat(model.getValueAt(0, 2)).isEqualTo("logical")
            assertThat(model.getValueAt(0, 3)).isEqualTo("physical")
            assertThat(model.getValueAt(0, 4)).isEqualTo("reasons")
        }
    }

    @Test
    fun `StackEvents are added to the table in reverse order`() {
        val fooEvent = StackEvent.builder().logicalResourceId("foo").resourceStatus(ResourceStatus.CREATE_COMPLETE).build()
        val barEvent = StackEvent.builder().logicalResourceId("bar").resourceStatus(ResourceStatus.CREATE_COMPLETE).build()

        val sut = EventsTableImpl()

        runInEdtAndWait {
            sut.insertEvents(listOf(fooEvent), pageChanged = false)
            sut.insertEvents(listOf(barEvent), pageChanged = false)
        }

        with((sut.component as JBScrollPane).viewport.view as JBTable) {
            assertThat(model.rowCount).isEqualTo(2)
            assertThat(model.getValueAt(0, 2)).isEqualTo("bar")
            assertThat(model.getValueAt(1, 2)).isEqualTo("foo")
        }
    }

    @Test
    fun `StackEvents added as part of a page-change replace existing events`() {
        val fooEvent = StackEvent.builder().logicalResourceId("foo").resourceStatus(ResourceStatus.CREATE_COMPLETE).build()
        val barEvent = StackEvent.builder().logicalResourceId("bar").resourceStatus(ResourceStatus.CREATE_COMPLETE).build()

        val sut = EventsTableImpl()

        runInEdtAndWait {
            sut.insertEvents(listOf(fooEvent), pageChanged = false)
            sut.insertEvents(listOf(barEvent), pageChanged = true)
        }

        with((sut.component as JBScrollPane).viewport.view as JBTable) {
            assertThat(model.rowCount).isEqualTo(1)
            assertThat(model.getValueAt(0, 2)).isEqualTo("bar")
        }
    }
}
