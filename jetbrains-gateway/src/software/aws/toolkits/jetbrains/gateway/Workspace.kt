// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.jetbrains.gateway.ssh.IntelliJPlatformProduct
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentStatus
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentSummary
import software.amazon.awssdk.services.codecatalyst.model.GetDevEnvironmentResponse
import software.amazon.awssdk.services.codecatalyst.model.Ide
import software.amazon.awssdk.services.codecatalyst.model.InstanceType
import software.aws.toolkits.jetbrains.services.caws.CawsProject
import software.aws.toolkits.jetbrains.services.caws.InactivityTimeout
import java.time.Instant

data class WorkspaceIdentifier(val project: CawsProject, val id: String) {
    val friendlyString by lazy { "${project.space}/${project.project}/$id" }
}

internal const val JB_ECR_DOMAIN = "jetbrains"
data class Workspace(
    val alias: String?,
    val identifier: WorkspaceIdentifier,
    val status: DevEnvironmentStatus,
    val statusReason: String?,
    val instanceType: InstanceType,
    val inactivityTimeout: InactivityTimeout,
    val repo: String?,
    val branch: String?,
    val lastUpdated: Instant,
    val labels: List<String>,
    val ides: List<Ide>
) {
    val ide = ides.firstOrNull { it.runtime()?.contains(JB_ECR_DOMAIN) ?: false }
    val isCompatible = ide != null
    val build = ide?.let {
        // TODO: probably need to model the @sha:[...] case better
        val (productCode, buildNumber) = ide.runtime().substringAfter("$JB_ECR_DOMAIN/").split(':', limit = 2)

        productCode.substringBefore("@sha").toUpperCase() to buildNumber
    }

    val platformProduct = build?.let { IntelliJPlatformProduct.fromProductCode(it.first) }
}

fun GetDevEnvironmentResponse.toWorkspace(identifier: WorkspaceIdentifier) = Workspace(
    alias = this.alias(),
    identifier = identifier,
    status = this.status(),
    statusReason = this.statusReason(),
    instanceType = this.instanceType(),
    inactivityTimeout = InactivityTimeout.fromMinutes(this.inactivityTimeoutMinutes()),
    repo = this.repositories().firstOrNull()?.repositoryName(),
    branch = this.repositories().firstOrNull()?.branchName(),
    lastUpdated = this.lastUpdatedTime(),
    labels = emptyList(),
    ides = this.ides()
)

fun DevEnvironmentSummary.toWorkspace(identifier: WorkspaceIdentifier) = Workspace(
    alias = this.alias(),
    identifier = identifier,
    status = status(),
    statusReason = statusReason(),
    instanceType = this.instanceType(),
    inactivityTimeout = InactivityTimeout.fromMinutes(this.inactivityTimeoutMinutes()),
    repo = this.repositories().firstOrNull()?.repositoryName(),
    branch = this.repositories().firstOrNull()?.branchName(),
    lastUpdated = this.lastUpdatedTime(),
    labels = emptyList(),
    ides = this.ides(),
)

fun DevEnvironmentStatus.inProgress() = when (this) {
    DevEnvironmentStatus.STARTING, DevEnvironmentStatus.STOPPING, DevEnvironmentStatus.PENDING, DevEnvironmentStatus.DELETING -> true
    else -> false
}
