// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources

class S3ServiceNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> =
        AwsResourceCache.getInstance(nodeProject).getResourceNow(S3Resources.listBucketsByActiveRegion(nodeProject)).map { S3BucketNode(nodeProject, it) }
}

class S3BucketNode(project: Project, val bucket: Bucket) :
    AwsExplorerResourceNode<String>(project, S3Client.SERVICE_NAME, bucket.name(), AwsIcons.Resources.S3_BUCKET) {

    override fun resourceType(): String = "bucket"

    override fun resourceArn() = "arn:aws:s3:::${bucket.name()}"

    override fun isAlwaysShowPlus(): Boolean = false

    override fun onDoubleClick() {
        openEditor(nodeProject, bucket)
    }

    override fun displayName(): String = bucket.name()
}
