package com.amazonaws.intellij.aws.lambda

import com.amazonaws.intellij.aws.IamRole
import com.amazonaws.intellij.aws.S3Bucket

data class LambdaFunction(val name: String, val handler: String, val iamRole: IamRole, val s3Bucket: S3Bucket, val description: String?)
