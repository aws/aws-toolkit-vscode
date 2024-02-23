// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift

import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.redshift.model.Cluster
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.getResourceIfPresent
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.RequireSsl
import software.aws.toolkits.jetbrains.services.redshift.auth.CLUSTER_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.redshift.auth.IamAuth
import software.aws.toolkits.jetbrains.services.sts.StsResources

object RedshiftUtils {
    private val REDSHIFT_REGION_REGEX =
        """.*\..*\.(.+).redshift\.""".toRegex()
    private val REDSHIFT_IDENTIFIER_REGEX =
        """.*//(.+)\..*\..*.redshift\..""".toRegex()

    fun extractRegionFromUrl(url: String?): String? = url?.let { REDSHIFT_REGION_REGEX.find(url)?.groupValues?.get(1) }
    fun extractClusterIdFromUrl(url: String?): String? = url?.let { REDSHIFT_IDENTIFIER_REGEX.find(url)?.groupValues?.get(1) }
}

fun Project.clusterArn(cluster: Cluster, region: AwsRegion): String {
    // Attempt to get account out of the cache. If not, it's empty so, it is still a valid arn
    val account = tryOrNull { this.getResourceIfPresent(StsResources.ACCOUNT) } ?: ""
    return "arn:${region.partitionId}:redshift:${region.id}:$account:cluster:${cluster.clusterIdentifier()}"
}

fun DataSourceRegistry.createDatasource(project: Project, cluster: Cluster) {
    val connectionSettings = AwsConnectionManager.getInstance(project).connectionSettings()
    builder
        .withJdbcAdditionalProperty(CREDENTIAL_ID_PROPERTY, connectionSettings?.credentials?.id)
        .withJdbcAdditionalProperty(REGION_ID_PROPERTY, connectionSettings?.region?.id)
        .withJdbcAdditionalProperty(CLUSTER_ID_PROPERTY, cluster.clusterIdentifier())
        .withUser(cluster.masterUsername())
        .withUrl("jdbc:redshift://${cluster.endpoint().address()}:${cluster.endpoint().port()}/${cluster.dbName()}")
        .commit()
    // TODO FIX_WHEN_MIN_IS_203 set auth provider ID in builder. It's in 202 but doesn't work
    newDataSources.firstOrNull()?.let {
        it.authProviderId = IamAuth.providerId
        // Force SSL on
        it.sslCfg = RequireSsl
    } ?: throw IllegalStateException("Newly inserted data source is not in the data source registry!")
}
