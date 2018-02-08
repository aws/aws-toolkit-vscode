package software.aws.toolkits.core.s3

import software.amazon.awssdk.core.config.AdvancedClientOption
import software.amazon.awssdk.core.config.ImmutableSyncClientConfiguration
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.S3Exception

class RegionalBuckets internal constructor(private val s3Client: S3Client) {
    private val clientRegion = determineRegion(s3Client)

    fun regionForBucket(bucketName: String): String {
        try {
            s3Client.headBucket { it.bucket(bucketName) }
            return clientRegion
        } catch (e: S3Exception) {
            e.headers()[BUCKET_REGION_HEADER]?.run { return@regionForBucket this }
            throw e
        }
    }

    //TODO: this is awful, replace with something that doesn't require reflection, looking at the headers on the
    // headBucket response would be enough but v2 doesn't support that yet
    private fun determineRegion(s3Client: S3Client): String {
        val field = s3Client.javaClass.getDeclaredField("clientConfiguration")
        field.isAccessible = true
        val configuration = field.get(s3Client) as ImmutableSyncClientConfiguration
        field.isAccessible = false
        return configuration.overrideConfiguration().advancedOption(AdvancedClientOption.AWS_REGION).value()
    }
}

fun S3Client.regionForBucket(bucket: String): String = RegionalBuckets(this).regionForBucket(bucket)

private const val BUCKET_REGION_HEADER = "x-amz-bucket-region"