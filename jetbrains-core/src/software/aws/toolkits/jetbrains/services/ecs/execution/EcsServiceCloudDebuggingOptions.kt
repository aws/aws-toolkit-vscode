// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.util.xmlb.annotations.Tag
import software.amazon.awssdk.services.ecs.model.LaunchType
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.ui.connection.BaseAwsConnectionOptions
import java.util.SortedMap

@Tag("EcsServiceCloudDebuggingOptions")
class EcsServiceCloudDebuggingOptions : BaseAwsConnectionOptions() {
    var clusterArn: String? = null
    var serviceArn: String? = null
    var containerOptions: SortedMap<String, ContainerOptions> = sortedMapOf()
}

data class EcsServiceCloudDebuggingRunSettings(
    val clusterArn: String,
    val serviceArn: String,
    val containerOptions: SortedMap<String, ImmutableContainerOptions>,
    val credentialProvider: ToolkitCredentialsProvider,
    val region: AwsRegion
)

@Tag("ContainerOptions")
class ContainerOptions {
    var platform: CloudDebuggingPlatform? = null
    var startCommand: String? = null
    var remoteDebugPorts: List<Int>? = null
    var artifactMappings: List<ArtifactMapping> = emptyList()
    var portMappings: List<PortMapping> = emptyList()
}

data class ImmutableContainerOptions(
    val platform: CloudDebuggingPlatform,
    val startCommand: String,
    var remoteDebugPorts: List<Int>,
    val artifactMappings: List<ImmutableArtifactMapping>,
    val portMappings: List<ImmutablePortMapping>
)

@Tag("ArtifactMapping")
data class ArtifactMapping(
    var localPath: String? = null,
    var remotePath: String? = null
)

data class ImmutableArtifactMapping(
    val localPath: String,
    val remotePath: String
)

@Tag("PortMapping")
data class PortMapping(
    var localPort: Int? = null,
    var remotePort: Int? = null
)

data class ImmutablePortMapping(
    val localPort: Int,
    val remotePort: Int
)

enum class EcsLaunchType(val sdkType: LaunchType) {
    EC2(LaunchType.EC2), FARGATE(LaunchType.FARGATE);
}
