package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.util.io.HttpRequests
import software.aws.toolkits.core.utils.RemoteResource
import software.aws.toolkits.core.utils.RemoteResourceResolver
import software.aws.toolkits.core.utils.UrlFetcher
import java.io.InputStream
import java.nio.file.Path
import java.nio.file.Paths

class RemoteResourceManager @JvmOverloads constructor(private val resolver: RemoteResourceResolver = MANAGER_INSTANCE) {

    fun resolvePath(resource: RemoteResource): Path = resolver.resolve(resource)
    fun resolveStream(resource: RemoteResource): InputStream = resolvePath(resource).toFile().inputStream()

    companion object {

        private val MANAGER_INSTANCE by lazy {
            val cachePath = Paths.get(PathManager.getSystemPath(), "aws-static-resources")
            cachePath.toFile().mkdir()
            RemoteResourceResolver(HttpRequestUrlFetcher, cachePath)
        }

        @JvmStatic
        fun getInstance(): RemoteResourceManager {
            return ServiceManager.getService(RemoteResourceManager::class.java)
        }

        object HttpRequestUrlFetcher : UrlFetcher {
            override fun fetch(url: String, file: Path) {
                HttpRequests.request(url).saveToFile(file.toFile(), null)
            }
        }
    }
}