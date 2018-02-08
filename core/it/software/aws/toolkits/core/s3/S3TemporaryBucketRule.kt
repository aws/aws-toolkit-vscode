package software.aws.toolkits.core.s3

import org.junit.rules.ExternalResource
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.testutils.service.S3BucketUtils.temporaryBucketName

//TODO: this should move to either a test util - or the core SDK.
class S3TemporaryBucketRule(private val s3Client: S3Client) : ExternalResource() {

    private val buckets = mutableListOf<String>()

    /**
     * Creates a temporary bucket with the optional prefix (or calling class if prefix is omitted)
     */
    fun createBucket(prefix: String = prefixFromCallingClass()): String {
        val bucketName: String = temporaryBucketName(prefix)
        s3Client.createBucket { it.bucket(bucketName) }
        buckets.add(bucketName)
        return bucketName
    }

    private fun prefixFromCallingClass(): String {
        val callingClass = Thread.currentThread().stackTrace[3].className
        return callingClass.substringAfterLast(".")
    }

    override fun after() {
        val exceptions = buckets.mapNotNull { deleteBucketAndContents(it) }
        if (exceptions.isNotEmpty()) {
            throw RuntimeException("Failed to delete all buckets. \n\t- ${exceptions.map { it.message }.joinToString("\n\t- ")}")
        }
    }

    private fun deleteBucketAndContents(bucket: String): Exception? = try {
        val objects = s3Client.listObjectsV2Iterable(ListObjectsV2Request.builder().bucket(bucket).build())
        objects.forEach {
            it.contents()?.forEach { obj -> s3Client.deleteObject { it.bucket(bucket).key(obj.key()) } }
        }
        s3Client.deleteBucket { it.bucket(bucket) }
        null
    } catch (e: Exception) {
        RuntimeException("Failed to delete bucket: $bucket - ${e.message}", e)
    }
}