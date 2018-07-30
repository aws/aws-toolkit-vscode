package software.aws.toolkits.core.s3

import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.S3Exception

fun S3Client.regionForBucket(bucketName: String): String {
    try {
        return this.headBucket { it.bucket(bucketName) }
            .sdkHttpResponse()
            .headers()[BUCKET_REGION_HEADER]?.first() ?: throw IllegalStateException("Failed to get bucket header")
    } catch (e: S3Exception) {
        e.awsErrorDetails().sdkHttpResponse().headers[BUCKET_REGION_HEADER]?.run { return@regionForBucket this }
        throw e
    }
}

private const val BUCKET_REGION_HEADER = "x-amz-bucket-region"