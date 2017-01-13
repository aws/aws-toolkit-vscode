package com.amazonaws.intellij.aws

import com.amazonaws.services.s3.model.AmazonS3Exception
import com.intellij.openapi.project.ProjectManager

val S3Bucket.region: String get() {
    val region = try {
        AwsResourceManager.getInstance(ProjectManager.getInstance().defaultProject).s3Client().getBucketLocation(this.name)
    } catch(e: AmazonS3Exception) {
        e.additionalDetails["Region"] ?: throw e
    }
    return if (region == "US") "us-east-1" else region
}