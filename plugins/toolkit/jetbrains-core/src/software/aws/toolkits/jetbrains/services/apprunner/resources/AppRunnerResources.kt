// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.resources

import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource

object AppRunnerResources {
    val LIST_SERVICES = ClientBackedCachedResource(AppRunnerClient::class, "apprunner.listServices") {
        listServicesPaginator { }.toList().flatMap { it.serviceSummaryList() }
    }

    val LIST_CONNECTIONS = ClientBackedCachedResource(AppRunnerClient::class, "apprunner.listConnections") {
        listConnectionsPaginator { }.toList().flatMap { it.connectionSummaryList() }
    }
}
