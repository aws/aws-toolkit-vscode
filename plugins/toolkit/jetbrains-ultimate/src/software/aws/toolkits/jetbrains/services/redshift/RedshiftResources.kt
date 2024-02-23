// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift

import software.amazon.awssdk.services.redshift.RedshiftClient
import software.amazon.awssdk.services.redshift.model.Cluster
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object RedshiftResources {
    val LIST_CLUSTERS: Resource.Cached<List<Cluster>> = ClientBackedCachedResource(RedshiftClient::class, "redshift.list_instances") {
        describeClustersPaginator().clusters().toList()
    }

    const val JDBC_REDSHIFT = "redshift"
    const val REDSHIFT_ENGINE_TYPE = "redshift"
}
