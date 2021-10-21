// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CacheBackedAwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.resources.message

class S3ServiceNode(project: Project, service: AwsExplorerServiceNode) :
    CacheBackedAwsExplorerServiceRootNode<Bucket>(project, service, S3Resources.LIST_BUCKETS) {
    override fun displayName(): String = message("explorer.node.s3")
    override fun toNode(child: Bucket): AwsExplorerNode<*> = S3BucketNode(nodeProject, child)
}

class S3BucketNode(project: Project, val bucket: Bucket) :
    AwsExplorerResourceNode<String>(project, S3Client.SERVICE_NAME, bucket.name(), AwsIcons.Resources.S3_BUCKET) {

    override fun resourceType(): String = "bucket"

    override fun resourceArn() = bucketArn(bucket.name(), nodeProject.activeRegion())

    override fun isAlwaysShowPlus(): Boolean = false

    override fun onDoubleClick() {
        openEditor(nodeProject, bucket.name())
    }

    override fun displayName(): String = bucket.name()
}
