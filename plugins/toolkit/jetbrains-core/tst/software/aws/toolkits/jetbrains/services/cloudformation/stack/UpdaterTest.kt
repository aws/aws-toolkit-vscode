// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assert
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.atLeast
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.DescribeStackEventsRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStackEventsResponse
import software.amazon.awssdk.services.cloudformation.model.DescribeStackResourcesRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStackResourcesResponse
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksResponse
import software.amazon.awssdk.services.cloudformation.model.Output
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackResource
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import java.time.Duration
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import javax.swing.JLabel
import javax.swing.SwingUtilities

private fun createSemaphore() = Semaphore(1).apply { acquire() }
private fun Semaphore.waitFor() = assert(tryAcquire(10, TimeUnit.SECONDS)) { "operation never completed" }

private fun StackStatus.asResponse(outputs: List<Output> = emptyList()) = DescribeStacksResponse.builder().stacks(
    Stack.builder().stackStatus(this).outputs(outputs).build()
).build()

class UpdaterTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private val treeView = mock<TreeView>()
    private val eventsTable = mock<EventsTable>()
    private val outputTable = mock<OutputsListener>()
    private val updateListener = mock<UpdateListener>()
    private val resourceListener = mock<ResourceListener>()

    @Before
    fun setUp() {
        arrayOf(treeView, eventsTable).forEach { whenever(it.component).thenReturn(JLabel()) }
    }

    @Test
    fun `view filled with data`() {
        val setStackStatus = createSemaphore()
        val fillResources = createSemaphore()
        val insertEvents = createSemaphore()
        whenever(treeView.fillResources(any())).then { fillResources.release() }
        whenever(treeView.setStackStatus(StackStatus.CREATE_COMPLETE)).then { setStackStatus.release() }
        whenever(eventsTable.insertEvents(any(), any())).then { insertEvents.release() }

        val mockEventsGenerator = MockEventsGenerator()

        val resources = listOf(
            StackResource.builder()
                .physicalResourceId("P1")
                .logicalResourceId("L1")
                .resourceStatus(ResourceStatus.CREATE_IN_PROGRESS)
                .build(),
            StackResource.builder()
                .physicalResourceId("P2")
                .logicalResourceId("L2")
                .resourceStatus(ResourceStatus.CREATE_COMPLETE)
                .build()
        )

        val outputs = listOf(
            Output.builder().outputKey("hello").outputValue("world").build()
        )

        var availablePages = emptySet<Page>()
        SwingUtilities.invokeLater {
            val client = mockClientManagerRule.createMock(mockEventsGenerator) { mock ->
                whenever(mock.describeStacks(any<DescribeStacksRequest>()))
                    .thenReturn(StackStatus.CREATE_IN_PROGRESS.asResponse())
                    .thenReturn(StackStatus.CREATE_COMPLETE.asResponse(outputs))
                whenever(mock.describeStackResources(any<DescribeStackResourcesRequest>()))
                    .thenReturn(DescribeStackResourcesResponse.builder().stackResources(resources).build())
            }
            Updater(
                treeView = treeView,
                eventsTable = eventsTable,
                outputsTable = outputTable,
                resourceListener = resourceListener,
                updateInterval = Duration.ofMillis(1),
                updateIntervalOnFinalState = Duration.ofMillis(10),
                listener = updateListener,
                client = client,
                setPagesAvailable = { p -> availablePages = p },
                stackId = "1234"
            ).start()
        }

        arrayOf(setStackStatus, fillResources, insertEvents).forEach { it.waitFor() }

        verify(treeView, atLeast(1)).setStackStatus(StackStatus.CREATE_IN_PROGRESS)
        verify(treeView, atLeast(1)).setStackStatus(StackStatus.CREATE_COMPLETE)
        verify(treeView, atLeast(1)).fillResources(resources)
        verify(outputTable, atLeast(1)).updatedOutputs(outputs)
        verify(eventsTable, atLeast(1)).insertEvents(mockEventsGenerator.currentPage, false)
        Assert.assertEquals("Wrong button for first page", availablePages, setOf(Page.NEXT))
    }

    @Test
    fun `can apply a filter to the resource tree`() {
        val fillResources = createSemaphore()
        whenever(treeView.fillResources(any())).then { fillResources.release() }

        val resources = listOf(
            StackResource.builder()
                .physicalResourceId("P1")
                .logicalResourceId("L1")
                .resourceStatus(ResourceStatus.CREATE_IN_PROGRESS)
                .build(),
            StackResource.builder()
                .physicalResourceId("P2")
                .logicalResourceId("L2")
                .resourceStatus(ResourceStatus.CREATE_COMPLETE)
                .build()
        )

        val client = delegateMock<CloudFormationClient> {
            on { describeStacks(any<DescribeStacksRequest>()) }.thenReturn(StackStatus.CREATE_COMPLETE.asResponse())
            on { describeStackResources(any<DescribeStackResourcesRequest>()) }.thenReturn(
                DescribeStackResourcesResponse.builder().stackResources(resources).build()
            )
            on { describeStackEvents(any<DescribeStackEventsRequest>()) }.thenReturn(
                DescribeStackEventsResponse.builder().build()
            )
        }

        Updater(
            treeView = treeView,
            eventsTable = eventsTable,
            outputsTable = outputTable,
            resourceListener = resourceListener,
            updateInterval = Duration.ofMillis(1),
            updateIntervalOnFinalState = Duration.ofMillis(10),
            listener = updateListener,
            client = client,
            setPagesAvailable = { },
            stackId = "1234"
        ).applyFilter { it.logicalResourceId() == "L1" }

        fillResources.waitFor()

        val captor = argumentCaptor<List<StackResource>>()
        verify(treeView).fillResources(captor.capture())
        assertThat(captor.firstValue).singleElement().satisfies {
            assertThat(it.logicalResourceId()).isEqualTo("L1")
        }
    }
}
