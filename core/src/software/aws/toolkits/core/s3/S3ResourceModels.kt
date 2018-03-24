package software.aws.toolkits.core.s3

import software.amazon.awssdk.core.sync.StreamingResponseHandler
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.BucketVersioningStatus
import software.amazon.awssdk.services.s3.model.CopyObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.MetadataDirective
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.Tag
import software.amazon.awssdk.services.s3.model.Tagging
import software.amazon.awssdk.services.s3.model.TaggingDirective
import java.io.InputStream
import java.net.URLEncoder
import java.time.Instant

/**
 * Extension to an [S3Client] for creating a [S3Bucket] resource.
 */
fun S3Client.bucket(name: String) = S3Bucket(name, this)

fun S3Client.file(bucket: String, key: String) = this.headObject { it.bucket(bucket).key(key) }.let { obj ->
    S3File(bucket, key, obj.lastModified(), obj.eTag(), obj.contentLength(), this)
}

fun S3Client.listS3Buckets(): List<S3Bucket> =
        this.listBuckets().buckets().map { S3Bucket(it.name(), this, creationDate = it.creationDate()) }

sealed class S3Key(val bucket: String, val key: String) {
    open val name = if (key.endsWith("/")) {
        key.dropLast(1)
    } else {
        key
    }.substringAfterLast("/")

    /**
     * A depth-first recursive walk of a tree of [S3Key]s, applying the [block] to each one.
     */
    fun walkTree(block: (S3Key) -> Unit) {
        walkTree({ true }, block)
    }

    /**
     * A depth-first recursive walk of a tree of [S3Key]s, applying the [block] to each one that matches the [filter].
     *
     * As soon as the [filter] fails, that branch is not traversed any further.
     * @param filter an inclusive filter to apply
     */
    fun walkTree(filter: (S3Key) -> Boolean, block: (S3Key) -> Unit) {
        if (filter(this)) {
            block(this)
            if (this is S3Directory) {
                this.children().forEach { it.walkTree(filter, block) }
            }
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as S3Key

        if (bucket != other.bucket) return false
        if (key != other.key) return false

        return true
    }

    override fun hashCode(): Int {
        var result = bucket.hashCode()
        result = 31 * result + key.hashCode()
        return result
    }
}

open class S3Directory internal constructor(bucket: String, key: String, private val client: S3Client) : S3Key(bucket, key) {
    fun children(): List<S3Key> {
        val request = ListObjectsV2Request.builder()
                .bucket(bucket)
                .delimiter("/")
                .prefix(key)
                .build()
        return client.listObjectsV2Paginator(request).flatMap {
            val directories = (it.commonPrefixes() ?: emptyList()).map {
                S3Directory(
                        bucket = bucket,
                        key = it.prefix(),
                        client = client
                )
            }

            val objects = (it.contents() ?: emptyList()).filterNot { it.key() == key }.map {
                S3File(
                        bucket = bucket,
                        key = it.key(),
                        lastModified = it.lastModified(),
                        etag = it.eTag(),
                        size = it.size(),
                        client = client
                )
            }

            directories + objects
        }
    }
}

class S3Bucket internal constructor(bucket: String, private val client: S3Client, val creationDate: Instant? = null) : S3Directory(bucket, "", client) {
    override val name = bucket
    val region: String by lazy { client.regionForBucket(bucket) }

    fun versioningStatus(): BucketVersioningStatus? = client.getBucketVersioning { it.bucket(bucket) }.status()

    fun tags(): Set<Tag> {
        try {
            return client.getBucketTagging { it.bucket(bucket) }?.tagSet()?.filterNotNull().orEmpty().toSet()
        } catch (e: S3Exception) {
            if (e.statusCode() == 404) {
                return emptySet()
            }
            throw e
        }
    }

    fun updateTags(tags: Set<Tag>?) {
        if (tags != null) {
            client.putBucketTagging { it.bucket(bucket).tagging { it.tagSet(tags) } }
        }
    }
}

class S3File internal constructor(
    bucket: String,
    key: String,
    val lastModified: Instant,
    val etag: String,
    val size: Long,
    private val client: S3Client
) : S3Key(bucket, key) {

    fun tags(): Set<Tag> =
            client.getObjectTagging { it.bucket(bucket).key(key) }?.tagSet()?.filterNotNull().orEmpty().toSet()

    fun metadata(): Map<String, String> = client.headObject { it.bucket(bucket).key(key) }.metadata()

    fun updateTags(tags: Set<Tag>) {
        client.putObjectTagging { it.bucket(bucket).key(key).tagging { it.tagSet(tags) } }
    }

    fun updateMetadata(metadata: Map<String, String>) {
        client.copyObject(baseUpdateMetadataRequest(metadata).build())
    }

    fun updateMetadataAndTags(metadata: Map<String, String>, tags: Set<Tag>) {
        client.copyObject(
                baseUpdateMetadataRequest(metadata).tagging(Tagging.builder().tagSet(tags).build()).taggingDirective(TaggingDirective.REPLACE).build()
        )
    }

    fun getInputStream(): InputStream {
        return client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())
    }

    fun getByteArray(): ByteArray {
        val request = GetObjectRequest.builder().bucket(bucket).key(key).build()
        return client.getObject(request, StreamingResponseHandler.toBytes()).asByteArray()
    }

    private fun baseUpdateMetadataRequest(metadata: Map<String, String>) =
            CopyObjectRequest.builder().bucket(bucket).key(key).copySource(
                    URLEncoder.encode(
                            "$bucket/$key",
                            "UTF-8"
                    )
            ).metadata(metadata).metadataDirective(MetadataDirective.REPLACE)
}
