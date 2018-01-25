package software.aws.toolkits.jetbrains.aws.lambda

import software.aws.toolkits.jetbrains.aws.IamRole
import software.aws.toolkits.jetbrains.aws.S3Bucket

data class LambdaFunction(val name: String, val handler: String, val iamRole: IamRole, val s3Bucket: S3Bucket, val description: String?)
