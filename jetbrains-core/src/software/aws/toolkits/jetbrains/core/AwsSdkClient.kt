package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.Disposer
import software.amazon.awssdk.http.AbortableCallable
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.SdkHttpFullRequest
import software.amazon.awssdk.http.SdkHttpFullResponse
import software.amazon.awssdk.http.SdkRequestContext
import software.amazon.awssdk.http.apache.ApacheHttpClient

class AwsSdkClient : Disposable {
    init {
        Disposer.register(ApplicationManager.getApplication(), this)
    }

    val sdkHttpClient: SdkHttpClient by lazy {
        ValidateCorrectThreadClient(ApacheHttpClient.builder().build())
    }

    override fun dispose() {
        sdkHttpClient.close()
    }

    private class ValidateCorrectThreadClient(private val base: SdkHttpClient) : SdkHttpClient by base {
        override fun prepareRequest(
            request: SdkHttpFullRequest?,
            requestContext: SdkRequestContext?
        ): AbortableCallable<SdkHttpFullResponse> {
            LOG.assertTrue(
                !ApplicationManager.getApplication().isDispatchThread ||
                        !ApplicationManager.getApplication().isWriteAccessAllowed,
                "Network calls shouldn't be made on EDT or inside write action"
            )

            return base.prepareRequest(request, requestContext)
        }
    }

    companion object {
        private val LOG = Logger.getInstance(AwsSdkClient::class.java)

        fun getInstance(): AwsSdkClient {
            return ServiceManager.getService(AwsSdkClient::class.java)
        }
    }
}
