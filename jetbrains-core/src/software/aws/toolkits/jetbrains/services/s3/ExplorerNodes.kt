package software.aws.toolkits.jetbrains.services.s3

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.s3.S3Bucket
import software.aws.toolkits.core.s3.listS3Buckets
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.Icons.Services.S3_BUCKET_ICON
import software.aws.toolkits.jetbrains.core.Icons.Services.S3_SERVICE_ICON
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerServiceRootNode
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class S3ServiceNode(project: Project) :
        AwsExplorerServiceRootNode(project, "Amazon S3", S3_SERVICE_ICON) {
    override fun serviceName() = "s3" // TODO: Get from client in v2

    private val client: S3Client = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> =
            client.listS3Buckets().map { mapResourceToNode(it) }

    private fun mapResourceToNode(resource: S3Bucket) = S3BucketNode(project!!, this, resource)
}

class S3BucketNode(project: Project, serviceNode: S3ServiceNode, val bucket: S3Bucket) :
        AwsExplorerResourceNode<S3Bucket>(project, serviceNode, bucket, S3_BUCKET_ICON) {

    private val editorManager = FileEditorManager.getInstance(project)
    val client: S3Client = AwsClientManager.getInstance(project).getClient()

    override fun getChildren(): Collection<AbstractTreeNode<Any>> = emptyList()

    override fun resourceType(): String = "bucket"

    override fun onDoubleClick(model: DefaultTreeModel, selectedElement: DefaultMutableTreeNode) {
        val bucketVirtualFile = S3VirtualBucket(S3VirtualFileSystem(client), bucket)
        editorManager.openFile(bucketVirtualFile, true)
    }

    override fun toString(): String = bucket.name
}