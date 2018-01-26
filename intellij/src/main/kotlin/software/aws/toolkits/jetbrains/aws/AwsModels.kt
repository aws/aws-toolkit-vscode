package software.aws.toolkits.jetbrains.aws

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