package software.aws.toolkits.jetbrains.s3.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.s3.S3Bucket
import software.aws.toolkits.core.s3.listS3Buckets
import software.aws.toolkits.jetbrains.aws.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.aws.s3.S3VirtualFileSystem
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.ui.S3_BUCKET_ICON
import software.aws.toolkits.jetbrains.ui.S3_SERVICE_ICON
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerServiceRootNode
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class AwsExplorerS3RootNode(project: Project) :
        AwsExplorerServiceRootNode(project, "Amazon S3", S3_SERVICE_ICON) {
    override fun serviceName() = "s3"; // TODO: Get from client in v2

    private val client: S3Client = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> =
            client.listS3Buckets().map { mapResourceToNode(it) }

    private fun mapResourceToNode(resource: S3Bucket) = AwsExplorerBucketNode(project!!, this, resource)
}

class AwsExplorerBucketNode(project: Project, serviceNode: AwsExplorerS3RootNode, private val bucket: S3Bucket) :
        AwsExplorerResourceNode<S3Bucket>(project, serviceNode, bucket, S3_BUCKET_ICON) {

    private val editorManager = FileEditorManager.getInstance(project)
    private val client: S3Client = AwsClientManager.getInstance(project).getClient()

    override fun getChildren(): Collection<AbstractTreeNode<Any>> = emptyList()

    override fun resourceName(): String = "bucket"

    override fun onDoubleClick(model: DefaultTreeModel, selectedElement: DefaultMutableTreeNode) {
        val bucketVirtualFile = S3VirtualBucket(S3VirtualFileSystem(client), bucket)
        editorManager.openFile(bucketVirtualFile, true)
    }

    override fun toString(): String = bucket.name
}