// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.ListProjectsRequest

fun CodeCatalystClient.listAccessibleProjectsPaginator(listProjectsRequest: (ListProjectsRequest.Builder) -> Unit) = listProjectsPaginator {
    it.filters({ filter ->
        filter.key("hasAccessTo")
        filter.values("true")
    })

    listProjectsRequest(it)
}
