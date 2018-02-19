package software.aws.toolkits.jetbrains.core

import assertk.assert
import assertk.assertions.isInstanceOf
import com.intellij.testFramework.ProjectRule
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction

class TestAwsResourceCache : AwsResourceCache {
    override fun lambdaFunctions(): List<LambdaFunction> = emptyList()
}

class TestAwsResourceCacheTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun getTestImplementationDuringTesting() {
        val resourceCache = AwsResourceCache.getInstance(projectRule.project)
        assert(resourceCache).isInstanceOf(TestAwsResourceCache::class)
    }
}