package com.amazonaws.intellij.aws

import com.amazonaws.services.s3.model.AmazonS3Exception

data class S3Bucket(val name: String) {
    override fun toString(): String {
        return name;
    }
}

data class IamRole(val name: String, val arn: String) {
    override fun toString(): String {
        return name
    }
}