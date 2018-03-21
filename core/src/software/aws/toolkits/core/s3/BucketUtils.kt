package software.aws.toolkits.core.s3

import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest
import software.amazon.awssdk.services.s3.model.ObjectIdentifier

fun S3Client.deleteBucketAndContents(bucket: String) {
    this.listObjectVersionsPaginator(ListObjectVersionsRequest.builder().bucket(bucket).build()).forEach { resp ->
        val versions = resp.versions()?.map {
            ObjectIdentifier.builder()
                    .key(it.key())
                    .versionId(it.versionId()).build()
        } ?: return@forEach
        this.deleteObjects { it.bucket(bucket).delete { it.objects(versions) } }
    }

    this.deleteBucket { it.bucket(bucket) }
}