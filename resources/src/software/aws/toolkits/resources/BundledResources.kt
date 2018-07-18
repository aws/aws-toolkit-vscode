package software.aws.toolkits.resources

import java.io.InputStream

object BundledResources {
    val ENDPOINTS_FILE: InputStream get() = javaClass.getResourceAsStream("endpoints.json")
}