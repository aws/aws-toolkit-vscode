package com.amazonaws.intellij.aws

import com.amazonaws.services.s3.model.AmazonS3Exception

data class S3Bucket(val name: String) {
    override fun toString(): String {
        return name;
    }

    fun region(client: S3ClientProvider): String {
        val region = try {
            client.s3Client().getBucketLocation(this.name)
        } catch(e: AmazonS3Exception) {
            e.additionalDetails["Region"] ?: throw e
        }
        return if (region == "US") "us-east-1" else region
    }
}

data class IamRole(val name: String, val arn: String) {
    override fun toString(): String {
        return name
    }
}