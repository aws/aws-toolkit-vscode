package software.aws.toolkits.core.s3

import assertk.assert
import assertk.assertions.contains
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest

class S3FileTest {

    private val client = S3Client.create()
    @Rule
    @JvmField
    val bucketHelper = S3TemporaryBucketRule(client)

    @Test
    fun canUpdateMetadata() {
        val bucketName = bucketHelper.createBucket()
        val key = "key"
        client.putObject(PutObjectRequest.builder().bucket(bucketName).key(key).build(), RequestBody.of(""))
        val bucket = client.bucket(bucketName)
        val file = bucket.children()[0] as S3File

        file.updateMetadata(mapOf("hello" to "blah"))

        val metadata = file.metadata()

        assert(metadata) {
            contains("hello" to "blah")
        }
    }
}