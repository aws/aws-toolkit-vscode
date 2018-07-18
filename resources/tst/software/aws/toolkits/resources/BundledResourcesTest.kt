package software.aws.toolkits.resources

import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.core.IsNull.notNullValue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import java.net.URL

@RunWith(Parameterized::class)
class BundledResourcesTest(private val file: URL?) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data() = listOf(
            BundledResources.ENDPOINTS_FILE
        )
    }

    @Test
    fun fileExistsAndHasContent() {
        assertThat(file, notNullValue())
        file?.openStream()?.use { assertThat(it.read() > 0, equalTo(true)) }
    }
}