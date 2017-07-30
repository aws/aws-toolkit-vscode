package com.amazonaws.intellij.s3.explorer

import com.amazonaws.intellij.ui.S3_BUCKET_ICON
import com.amazonaws.intellij.ui.S3_SERVICE_ICON
import com.amazonaws.intellij.ui.explorer.AwsExplorerNode
import com.amazonaws.intellij.ui.explorer.AwsExplorerServiceRootNode
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.Bucket
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project

/**
 * Created by zhaoxiz on 7/28/17.
 */
class AwsExplorerS3RootNode(project: Project?, region: String):
        AwsExplorerServiceRootNode<Bucket>(project, "Amazon S3", region, S3_SERVICE_ICON) {

    private var client: AmazonS3 = AmazonS3ClientBuilder.standard()
            .withRegion(region)
            .build()

    override fun loadResources(): MutableList<Bucket> {
        return client.listBuckets()
    }

    override fun mapResourceToNode(resource: Bucket) = AwsExplorerBucketNode(project, resource, region)
}

class AwsExplorerBucketNode(project: Project?, private val bucket: Bucket, region: String):
        AwsExplorerNode<Bucket>(project, bucket, region, S3_BUCKET_ICON) {

    override fun getChildren(): MutableCollection<out AbstractTreeNode<Any>> {
        return mutableListOf()
    }

    override fun toString(): String {
        return bucket.name
    }
}