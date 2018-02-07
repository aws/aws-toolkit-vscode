package software.aws.toolkits.jetbrains.aws.lambda

import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.aws.IamRole

data class FunctionUploadDetails(
    val name: String,
    val handler: String,
    val iamRole: IamRole,
    val s3Bucket: Bucket,
    val description: String?
)
