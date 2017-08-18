package software.aws.toolkits.jetbrains.s3.explorer

import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.Bucket
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.ui.S3_BUCKET_ICON
import software.aws.toolkits.jetbrains.ui.S3_SERVICE_ICON
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerServiceRootNode

class AwsExplorerS3RootNode(project: Project, region: String) :
        AwsExplorerServiceRootNode(project, "Amazon S3", S3_SERVICE_ICON) {

    //TODO use a ClientFactory instead
    private val client: AmazonS3 = AmazonS3ClientBuilder.standard()
            .withRegion(region)
            .build()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        return  client.listBuckets().map { mapResourceToNode(it) }
    }

    private fun mapResourceToNode(resource: Bucket) = AwsExplorerBucketNode(project!!, resource)
}

class AwsExplorerBucketNode(project: Project, private val bucket: Bucket):
        AwsExplorerNode<Bucket>(project, bucket, S3_BUCKET_ICON) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun toString(): String {
        return bucket.name
    }
}