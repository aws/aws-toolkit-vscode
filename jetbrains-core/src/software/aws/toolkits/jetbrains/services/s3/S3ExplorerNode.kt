// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerService
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService

class S3ServiceNode(project: Project) : AwsExplorerServiceRootNode(project, AwsExplorerService.S3) {
    private val client: S3Client = AwsClientManager.getInstance(project).getClient()

    private val activeRegionId = ProjectAccountSettingsManager.getInstance(nodeProject).activeRegion.id
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> {
        val bucketsInRegion = AwsResourceCache.getInstance(nodeProject)
            .getResourceNow(S3Resources.LIST_BUCKETS)
            .asSequence()
            .filter { AwsResourceCache.getInstance(nodeProject).getResourceNow(S3Resources.bucketRegion(it.name())) == activeRegionId }

        return bucketsInRegion.map { S3Bucket(it.name(), client, it.creationDate()) }
            .map { S3BucketNode(nodeProject, it, client) }
            .toList()
    }
}

class S3BucketNode(project: Project, val bucket: S3Bucket, val client: S3Client) :
    AwsExplorerResourceNode<String>(project, S3Client.SERVICE_NAME, bucket.bucket, AwsIcons.Resources.CLOUDFORMATION_STACK) {

    override fun resourceType(): String = "bucket"

    override fun resourceArn() = "arn:aws:s3:::${bucket.bucket}"

    override fun isAlwaysShowPlus(): Boolean = false

    override fun onDoubleClick() {
        if (!DumbService.getInstance(nodeProject).isDumb) {
            val editorManager = FileEditorManager.getInstance(nodeProject)
            val virtualBucket = S3VirtualBucket(S3VirtualFileSystem(client), bucket)
            editorManager.openTextEditor(OpenFileDescriptor(nodeProject, virtualBucket), true)
            TelemetryService.getInstance().record(nodeProject, "s3") {
                datum("openeditor") {
                    count()
                }
            }
        }
    }

    override fun displayName(): String = bucket.bucket
}