// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import org.junit.Assert
import org.mockito.Mockito
import org.mockito.Mockito.`when`
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.DescribeStackEventsRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStackEventsResponse
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.StackEvent
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import java.time.Instant
import javax.swing.SwingUtilities

internal class MockEventsGenerator {
    private val events = mutableListOf<StackEvent>()
    private var lastEventId = 1

    init {
        repeat(4096) { addEvent() }
    }

    fun addEvent() {
        events.add(0, StackEvent.builder()
            .physicalResourceId("P$lastEventId")
            .logicalResourceId("L$lastEventId")
            .resourceType("Type")
            .resourceStatus(ResourceStatus.CREATE_IN_PROGRESS)
            .timestamp(Instant.now())
            .eventId(lastEventId.toString())
            .build())
        lastEventId++
    }

    val currentPage: List<StackEvent> get() = getEvents(DescribeStackEventsRequest.builder().stackName("foo").build()).stackEvents()

    fun getEvents(request: DescribeStackEventsRequest): DescribeStackEventsResponse {
        Assert.assertNotNull("No stack name provided", request.stackName())
        val page = request.nextToken()
        assert(!SwingUtilities.isEventDispatchThread())
        Thread.sleep(600)
        val responseBuilder = DescribeStackEventsResponse.builder()
        val pageSize = 1024
        val maxPage = (events.size / pageSize) - 1
        val pageN = page?.let { page.toInt() } ?: 0
        assert(pageN in 0..maxPage)
        responseBuilder.stackEvents(events.subList(pageN * pageSize, ((pageN + 1) * pageSize)))
        if (pageN < maxPage) {
            responseBuilder.nextToken((pageN + 1).toString())
        }
        return responseBuilder.build()
    }
}

internal fun MockClientManagerRule.createMock(
    events: MockEventsGenerator,
    postprocess: (CloudFormationClient) -> Unit = { }
) = create<CloudFormationClient>().apply {
    `when`(describeStackEvents(Mockito.any<DescribeStackEventsRequest>())).then { invocation ->
        events.getEvents((invocation.arguments[0] as DescribeStackEventsRequest))
    }
    postprocess(this)
}
