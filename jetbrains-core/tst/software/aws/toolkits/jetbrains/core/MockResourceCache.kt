package software.aws.toolkits.jetbrains.core

import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction

class MockResourceCache : AwsResourceCache {
    override fun lambdaFunctions(): List<LambdaFunction> = emptyList()
}
