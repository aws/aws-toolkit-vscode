package software.aws.toolkits.jetbrains.s3.explorer

import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.Bucket
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsClientFactory
import software.aws.toolkits.jetbrains.ui.S3_BUCKET_ICON
import software.aws.toolkits.jetbrains.ui.S3_SERVICE_ICON
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerServiceRootNode

class AwsExplorerS3RootNode(project: Project, profile: String, region: String):
        AwsExplorerServiceRootNode<Bucket>(project, "Amazon S3", profile, region, S3_SERVICE_ICON) {

    private var client: AmazonS3 = AwsClientFactory.getInstance(project).getS3Client(profile, region)

    //TODO we need to load all the buckets
    override fun loadResources(): Collection<Bucket> {
        return client.listBuckets()
    }

    override fun mapResourceToNode(resource: Bucket) = AwsExplorerBucketNode(project!!, resource, profile, region)
}

class AwsExplorerBucketNode(project: Project, private val bucket: Bucket, profile: String, region: String):
        AwsExplorerNode<Bucket>(project, bucket, profile, region, S3_BUCKET_ICON) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun toString(): String {
        return bucket.name
    }
}