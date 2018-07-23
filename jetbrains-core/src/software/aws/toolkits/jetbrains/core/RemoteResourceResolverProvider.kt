package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.util.io.HttpRequests
import com.intellij.util.io.createDirectories
import software.aws.toolkits.core.utils.DefaultRemoteResourceResolver
import software.aws.toolkits.core.utils.RemoteResourceResolver
import software.aws.toolkits.core.utils.UrlFetcher
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture

interface RemoteResourceResolverProvider {
    fun get(): RemoteResourceResolver

    companion object {
        fun getInstance(): RemoteResourceResolverProvider {
            return ServiceManager.getService(RemoteResourceResolverProvider::class.java)
        }
    }
}

class DefaultRemoteResourceResolverProvider @JvmOverloads constructor(private val resolver: RemoteResourceResolver = RESOLVER_INSTANCE) :
    RemoteResourceResolverProvider {
    override fun get() = resolver

    companion object {

        private val RESOLVER_INSTANCE by lazy {
            val cachePath = Paths.get(PathManager.getSystemPath(), "aws-static-resources").createDirectories()

            DefaultRemoteResourceResolver(HttpRequestUrlFetcher, cachePath) {
                val future = CompletableFuture<Path>()
                ApplicationManager.getApplication().executeOnPooledThread {
                    try {
                        future.complete(it.call())
                    } catch (e: Exception) {
                        future.completeExceptionally(e)
                    }
                }
                future
            }
        }

        object HttpRequestUrlFetcher : UrlFetcher {
            override fun fetch(url: String, file: Path) {
                HttpRequests.request(url).saveToFile(file.toFile(), null)
            }
        }
    }
}